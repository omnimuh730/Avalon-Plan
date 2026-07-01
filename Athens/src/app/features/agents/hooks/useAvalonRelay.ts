import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  DEFAULT_SESSION_ID,
  SOCKET_EVENTS,
  createActionId,
  type ActionablePageContext,
  type ActionableTarget,
  type ActionableTree,
  type ActionResult,
  type ApplyProgress,
  type AttachedFile,
  type InjectionPlan,
  type RegisteredPayload,
  type RemoteAction,
  type TabInfo,
  type TargetSelector,
} from "@avalon/shared";
import { analyzeFormFields } from "../avalon/ai/analyze-form";
import { buildApplyInjectionPlanPayload } from "../avalon/ai/apply-injection-plan";
import { buildFormInjectionPlan } from "../avalon/ai/generate-injection-plan";
import type { FieldActionPlan, FormAnalysisResult } from "../avalon/ai/types";
import { avalonRelayUrl } from "../../../services/agentApi";
import { applyToJob, fetchJobDescription, generateJobResumeStream, type ResumeSectionPurpose } from "../../../api/jobs";
import { requestVerificationCode } from "../../../api/mail";
import { classifyApplyOutcome, type ApplyPageState } from "../lib/applyOutcome";
import { generateRecoveryScript } from "../avalon/ai/recover-apply";
import { verifyApplyOutcome, type ApplyVerifyResult } from "../avalon/ai/verify-apply";
import { validateJobPage, type PageValidityResult } from "../avalon/ai/validate-page";
import { postApplyLog, type ApplyLogEvent } from "../../../api/avalonLog";

/** Short unique id for one apply run (used to correlate the debug log file + Mongo doc). */
function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Max self-healing retries for a single failed apply (per Phase C). */
const MAX_RECOVERY_ATTEMPTS = 10;

/**
 * Generic cues that a page is asking for an emailed verification / one-time code
 * (Phase D). Language-based only — no sender/vendor strings, per Guide.md.
 */
const VERIFICATION_CUE =
  /\b(verification code|verify your (email|identity)|one[- ]?time (code|password|passcode)|enter the code|check your (email|inbox)|we (sent|emailed|texted) you a code|confirmation code|security code|otp\b|passcode|6[- ]digit|4[- ]digit)\b/i;

interface StepRunResult {
  id: string;
  label: string;
  op: string;
  ok: boolean;
  error?: string;
}

/**
 * Result of the manual "Verify result" step (pipeline step 6). Three outcomes:
 *  - success:    the application was submitted/received.
 *  - failed:     rejected or unconfirmed — `reason` explains why.
 *  - additional: an extra step is required (OTP / email verification code / link).
 */
export interface ManualVerifyResult {
  kind: "success" | "failed" | "additional";
  reason: string;
  detail?: string;
}

/** One AI request's token + cost usage, for the per-job usage panel. */
export interface UsageEntry {
  label: string;
  at: string;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** Loose usage shape accepted from any AI call (ai-bff, résumé gen, analyze). */
type UsageLike =
  | {
      promptTokens?: number;
      cachedTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      costUsd?: number;
      cost?: { totalUsd?: number } | number;
    }
  | undefined
  | null;

/** A generated per-job résumé held for attach + preview. */
export interface JobResume {
  jobId: string;
  file: AttachedFile;
  reused: boolean;
  generationId: string | null;
  resumePdfPath?: string | null;
}

/** Manual/link-only jobs have no Mongo id or JD, so no tailored résumé is generated. */
function isManualJob(job: QueuedJob): boolean {
  return job.source === "manual" || job.id.startsWith("manual:");
}

export interface AvalonLogEntry {
  id: string;
  at: string;
  message: string;
  success?: boolean;
}

export interface QueuedJob {
  id: string;
  title: string;
  company: string;
  url: string;
  source: string;
}

/** Per-job manual pipeline progress (steps 2–8). */
export interface JobPipelineState {
  opened: boolean;
  validated: boolean;
  resumeReady: boolean;
  scanned: boolean;
  analyzed: boolean;
  applied: boolean;
  verified: boolean;
}

const EMPTY_PIPELINE: JobPipelineState = {
  opened: false,
  validated: false,
  resumeReady: false,
  scanned: false,
  analyzed: false,
  applied: false,
  verified: false,
};

export function useAvalonRelay(applicantContext: string, applierName = "") {
  const [serverUrl, setServerUrl] = useState(() => avalonRelayUrl());
  const [sessionId, setSessionId] = useState("");
  const [connected, setConnected] = useState(false);
  const [registered, setRegistered] = useState<RegisteredPayload | null>(null);
  const [peers, setPeers] = useState({ extension: false, controller: false });
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<number | "">("");
  // Combobox option probing is always on — it's what makes Greenhouse/Ashby
  // dropdowns fillable, and the small extra scan time is worth it on every site.
  const probeComboboxes = true;
  const [logs, setLogs] = useState<AvalonLogEntry[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [actionableTree, setActionableTree] = useState<ActionableTree | null>(null);
  const [treePage, setTreePage] = useState<ActionablePageContext | null>(null);
  const [formAnalysis, setFormAnalysis] = useState<FormAnalysisResult | null>(null);
  const [generatedScript, setGeneratedScript] = useState("");
  const [fieldScriptsById, setFieldScriptsById] = useState<Record<string, string>>({});
  const [injectionPlan, setInjectionPlan] = useState<InjectionPlan | null>(null);
  const [selectedTreeFieldId, setSelectedTreeFieldId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [jobQueue, setJobQueue] = useState<QueuedJob[]>([]);
  const [activeJobIndex, setActiveJobIndex] = useState(0);
  const [applyPhase, setApplyPhase] = useState<ApplyProgress | null>(null);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [resumesByJobId, setResumesByJobId] = useState<Record<string, JobResume>>({});
  const [resumeJobId, setResumeJobId] = useState<string | null>(null);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [generatingResumeJobId, setGeneratingResumeJobId] = useState<string | null>(null);
  const [resumeGenerateStep, setResumeGenerateStep] = useState<string | null>(null);
  const [resumeGeneratedSections, setResumeGeneratedSections] = useState<
    Partial<Record<ResumeSectionPurpose, boolean>>
  >({});
  const [pipelineByJobId, setPipelineByJobId] = useState<Record<string, JobPipelineState>>({});
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<ManualVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [tabValidity, setTabValidity] = useState<PageValidityResult | null>(null);
  const [validatingTab, setValidatingTab] = useState(false);
  const [usageRequests, setUsageRequests] = useState<UsageEntry[]>([]);
  const [applyDone, setApplyDone] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const applyingRef = useRef(false);
  const pendingActionsRef = useRef<Map<string, (result: ActionResult) => void>>(new Map());
  const resumeGenByJobIdRef = useRef<Map<string, Promise<AttachedFile>>>(new Map());
  // Debug run-logging: current run id, its job, a buffered event list + flush timer.
  const runIdRef = useRef<string | null>(null);
  const runJobRef = useRef<QueuedJob | null>(null);
  const runEventsRef = useRef<ApplyLogEvent[]>([]);
  const runFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);
  const selectedTabIdRef = useRef(selectedTabId);
  const jobQueueRef = useRef(jobQueue);
  const activeJobIndexRef = useRef(activeJobIndex);
  sessionIdRef.current = sessionId;
  selectedTabIdRef.current = selectedTabId;
  jobQueueRef.current = jobQueue;
  activeJobIndexRef.current = activeJobIndex;

  const canExecute = connected && peers.extension;
  const executeDisabledReason = !connected
    ? "Connect to the Avalon relay server first."
    : !peers.extension
      ? `Extension not on session "${sessionId || DEFAULT_SESSION_ID}". Install the Avalon extension and match the session ID.`
      : null;

  /** Flush buffered run-log events to the backend (local JSONL + Mongo). */
  const flushRunLog = useCallback(
    (extra?: { status?: string; finished?: boolean }) => {
      const runId = runIdRef.current;
      if (!runId) return;
      const events = runEventsRef.current.splice(0);
      if (!events.length && !extra?.status && !extra?.finished) return;
      void postApplyLog({
        runId,
        applierName: applierName || undefined,
        job: runJobRef.current ?? undefined,
        events,
        ...extra,
      });
    },
    [applierName],
  );

  const scheduleRunFlush = useCallback(() => {
    if (runFlushTimerRef.current) return;
    runFlushTimerRef.current = setTimeout(() => {
      runFlushTimerRef.current = null;
      flushRunLog();
    }, 800);
  }, [flushRunLog]);

  const pushLog = useCallback(
    (message: string, success?: boolean) => {
      setLogs((prev) => [
        {
          id: `${Date.now()}_${Math.random()}`,
          at: new Date().toLocaleTimeString(),
          message,
          success,
        },
        ...prev.slice(0, 49),
      ]);
      // Mirror every UI log line into the active run's debug log.
      if (runIdRef.current) {
        runEventsRef.current.push({
          at: new Date().toISOString(),
          level: success === false ? "error" : success === true ? "success" : "info",
          message,
        });
        scheduleRunFlush();
      }
    },
    [scheduleRunFlush],
  );

  /** Record one AI request's token/cost usage for the per-job usage panel. */
  const recordUsage = useCallback((label: string, u: UsageLike) => {
    if (!u) return;
    const costUsd =
      u.costUsd ?? (typeof u.cost === "number" ? u.cost : u.cost?.totalUsd) ?? 0;
    if ((u.totalTokens ?? 0) === 0 && costUsd === 0) return;
    setUsageRequests((prev) => [
      ...prev,
      {
        label,
        at: new Date().toLocaleTimeString(),
        promptTokens: u.promptTokens ?? 0,
        cachedTokens: u.cachedTokens ?? 0,
        completionTokens: u.completionTokens ?? 0,
        totalTokens: u.totalTokens ?? 0,
        costUsd,
      },
    ]);
  }, []);

  const markPipeline = useCallback((jobId: string, patch: Partial<JobPipelineState>) => {
    if (!jobId) return;
    setPipelineByJobId((prev) => ({
      ...prev,
      [jobId]: { ...EMPTY_PIPELINE, ...prev[jobId], ...patch },
    }));
  }, []);

  /** Clear scan/analyze state when switching queue jobs (pipeline flags stay per job). */
  const resetJobWorkspace = useCallback(() => {
    setActionableTree(null);
    setFormAnalysis(null);
    setTreePage(null);
    setTabValidity(null);
    setVerifyResult(null);
    setApplyDone(false);
    setInjectionPlan(null);
    setGeneratedScript("");
    setFieldScriptsById({});
    setSelectedTreeFieldId(null);
  }, []);

  const resetJobUsage = useCallback(() => setUsageRequests([]), []);

  /** Begin a new debug run (starts a JSONL file + Mongo doc via the meta event). */
  const startRunLog = useCallback(
    (job: QueuedJob, meta: Record<string, unknown>) => {
      const runId = newRunId();
      runIdRef.current = runId;
      runJobRef.current = job;
      runEventsRef.current = [];
      void postApplyLog({
        runId,
        applierName: applierName || undefined,
        job,
        meta: { startedAt: new Date().toISOString(), ...meta },
        status: "running",
      });
      return runId;
    },
    [applierName],
  );

  /** Log a structured, data-rich event to the active run (no UI line). */
  const logRunData = useCallback(
    (phase: string, data: unknown, message?: string) => {
      if (!runIdRef.current) return;
      runEventsRef.current.push({
        at: new Date().toISOString(),
        level: "info",
        phase,
        message: message ?? `[${phase}]`,
        data,
      });
      scheduleRunFlush();
    },
    [scheduleRunFlush],
  );

  /** Close out the current debug run and flush everything. */
  const endRunLog = useCallback(
    (status: string) => {
      if (!runIdRef.current) return;
      flushRunLog({ status, finished: true });
      runIdRef.current = null;
      runJobRef.current = null;
    },
    [flushRunLog],
  );

  const emitAction = useCallback(
    (remoteAction: RemoteAction) => {
      if (!socketRef.current?.connected) {
        pushLog("Not connected", false);
        return;
      }
      socketRef.current.emit(SOCKET_EVENTS.EXECUTE_ACTION, remoteAction);
      pushLog(`Sent ${remoteAction.action} (${remoteAction.id})`);
    },
    [pushLog],
  );

  const connect = useCallback(() => {
    socketRef.current?.removeAllListeners();
    socketRef.current?.disconnect();
    const next = io(serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socketRef.current = next;

    next.on("connect", () => {
      setConnected(true);
      pushLog("Connected to relay server");
      next.emit(
        SOCKET_EVENTS.REGISTER,
        { role: "controller", sessionId: sessionIdRef.current || undefined },
        (response: RegisteredPayload) => {
          setRegistered(response);
          setSessionId((prev) => prev || response.sessionId);
          setPeers(response.peers);
          pushLog(`Registered session ${response.sessionId}`);
        },
      );
    });

    next.on("disconnect", (reason) => {
      setConnected(false);
      setPeers({ extension: false, controller: false });
      if (reason !== "io client disconnect") {
        pushLog(`Disconnected (${reason})`);
      }
    });

    next.on("connect_error", (err) => {
      pushLog(`Connection error: ${err.message}`, false);
    });

    next.on("peers-update", (payload: { peers: typeof peers }) => {
      setPeers(payload.peers);
    });

    next.on(SOCKET_EVENTS.TABS_UPDATE, (nextTabs: TabInfo[]) => {
      setTabs(nextTabs);
      if (nextTabs.length && selectedTabIdRef.current === "") {
        const active = nextTabs.find((t) => t.active) ?? nextTabs[0];
        setSelectedTabId(active.id);
      }
    });

    next.on(SOCKET_EVENTS.ACTION_RESULT, (result: ActionResult) => {
      // Resolve any awaiting orchestration step (applyJob) before state updates.
      const resolver = pendingActionsRef.current.get(result.actionId);
      if (resolver) {
        pendingActionsRef.current.delete(result.actionId);
        resolver(result);
      }
      const data = result.data as
        | {
            tree?: ActionableTree;
            page?: ActionablePageContext;
            applied?: number;
            skipped?: number;
            failed?: number;
            urlMismatch?: { expected: string; actual: string };
          }
        | undefined;
      if (result.success && data?.tree) {
        setActionableTree(data.tree);
        setFormAnalysis(null);
        setGeneratedScript("");
        setFieldScriptsById({});
        setInjectionPlan(null);
        setSelectedTreeFieldId(null);
        if (data.page) {
          setTreePage(data.page);
          setSelectedTabId(data.page.tabId);
        }
        const activeJob = jobQueueRef.current[activeJobIndexRef.current];
        if (activeJob) {
          markPipeline(activeJob.id, { scanned: true, analyzed: false, applied: false, verified: false });
        }
        const groups = data.tree.length;
        const targets = data.tree.reduce((n, g) => n + g.children.length, 0);
        const pageHint = data.page?.url ? ` · ${data.page.url}` : "";
        pushLog(`Actionable tree: ${groups} group(s), ${targets} target(s)${pageHint}`, true);
        return;
      }
      if (result.success && data?.applied != null) {
        applyingRef.current = false;
        setApplying(false);
        const mismatch =
          data.urlMismatch != null
            ? ` (page URL changed: expected ${data.urlMismatch.expected})`
            : "";
        pushLog(
          `Apply inject: ${data.applied} applied, ${data.skipped ?? 0} skipped, ${data.failed ?? 0} failed${mismatch}`,
          (data.failed ?? 0) === 0,
        );
        return;
      }
      if (!result.success && applyingRef.current) {
        applyingRef.current = false;
        setApplying(false);
      }
      pushLog(
        result.success
          ? `Action ${result.actionId} OK${result.data ? `: ${JSON.stringify(result.data)}` : ""}`
          : `Action ${result.actionId} failed: ${result.error}`,
        result.success,
      );
    });

    next.on(SOCKET_EVENTS.APPLY_PROGRESS, (progress: ApplyProgress) => {
      setApplyPhase((prev) => {
        if (
          prev?.phase === "error" &&
          progress.phase !== "error" &&
          progress.phase !== "done" &&
          progress.phase !== "submitted"
        ) {
          return prev;
        }
        return progress;
      });
      pushLog(progress.message, progress.phase !== "error");
    });

    next.on(SOCKET_EVENTS.SCREENSHOT_RESULT, (payload: { dataUrl?: string; error?: string }) => {
      if (payload.dataUrl) {
        setScreenshot(payload.dataUrl);
        pushLog("Screenshot received", true);
      } else {
        pushLog(`Screenshot failed: ${payload.error}`, false);
      }
    });
  }, [markPipeline, pushLog, serverUrl]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
    };
  }, [connect]);

  /** Aggregated token + cost usage for the current job (total + per-request list). */
  const jobUsage = useMemo(() => {
    const sum = (k: keyof UsageEntry) =>
      usageRequests.reduce((n, r) => n + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
    return {
      requests: usageRequests,
      totalTokens: sum("totalTokens"),
      promptTokens: sum("promptTokens"),
      cachedTokens: sum("cachedTokens"),
      completionTokens: sum("completionTokens"),
      totalCostUsd: usageRequests.reduce((n, r) => n + r.costUsd, 0),
    };
  }, [usageRequests]);

  const actionPlanByFieldId = useMemo(() => {
    const map = new Map<string, FieldActionPlan>();
    for (const field of formAnalysis?.fields ?? []) {
      map.set(field.id, field);
    }
    return map;
  }, [formAnalysis]);

  const displayedScript = useMemo(() => {
    if (selectedTreeFieldId) {
      const snippet = fieldScriptsById[selectedTreeFieldId];
      if (snippet) return snippet;
      return `No step for "${selectedTreeFieldId}" — skipped or no value. Run Analyze to rebuild.`;
    }
    return generatedScript;
  }, [fieldScriptsById, generatedScript, selectedTreeFieldId]);

  const buildPlanFromFields = useCallback(
    (fields: FieldActionPlan[]): InjectionPlan | null => {
      if (!actionableTree?.length || !fields.length) return null;
      const { plan, preview, fieldPreviews } = buildFormInjectionPlan({
        tree: actionableTree,
        fields,
      });
      setInjectionPlan(plan);
      setGeneratedScript(preview);
      setFieldScriptsById(Object.fromEntries(fieldPreviews.map((entry) => [entry.id, entry.preview])));
      pushLog(`Fill plan built · ${plan.steps.length} step(s)`, true);
      return plan;
    },
    [actionableTree, pushLog],
  );

  const fetchActionableTree = useCallback(() => {
    emitAction({
      id: createActionId(),
      tabId: selectedTabId === "" ? undefined : Number(selectedTabId),
      action: "fetch_actionable_tree",
      payload: { probeComboboxes },
    });
  }, [emitAction, probeComboboxes, selectedTabId]);

  const getActiveQueuedJob = useCallback((): QueuedJob | null => {
    const queue = jobQueueRef.current;
    const idx = activeJobIndexRef.current;
    return queue[idx] ?? null;
  }, []);

  /**
   * Generate (or reuse) a per-job résumé via the Resume Generator pipeline.
   * Throws on failure — apply must abort (no bundled fallback).
   */
  const ensureJobResume = useCallback(
    async (job: QueuedJob, options?: { forceRegenerate?: boolean }): Promise<AttachedFile> => {
      if (!applierName) throw new Error("Select an applier profile before applying");
      if (isManualJob(job)) throw new Error(`"${job.title}" is a manual job — résumé generation requires a saved job with description`);

      if (!options?.forceRegenerate) {
        const cached = resumesByJobId[job.id];
        if (cached) {
          setResumeJobId(job.id);
          setResumeError(null);
          markPipeline(job.id, { resumeReady: true });
          return cached.file;
        }
      } else {
        resumeGenByJobIdRef.current.delete(job.id);
        setResumesByJobId((prev) => {
          const next = { ...prev };
          delete next[job.id];
          return next;
        });
      }

      const jd = await fetchJobDescription(job.id);
      if (!jd) throw new Error(`No job description for "${job.title}" — cannot generate tailored résumé`);

      pushLog(
        options?.forceRegenerate
          ? `Regenerating tailored résumé for "${job.title}" (Resume Generator + JD)…`
          : `Generating tailored résumé for "${job.title}" (Resume Generator config)…`,
        true,
      );
      const gen = await generateJobResumeStream(
        {
          applierName,
          jobId: job.id,
          jobDescription: jd,
          forceRegenerate: options?.forceRegenerate,
        },
        (progress) => {
          if (progress.stepLabel) setResumeGenerateStep(progress.stepLabel);
          if (Object.keys(progress.completedSections).length > 0) {
            setResumeGeneratedSections((prev) => ({ ...prev, ...progress.completedSections }));
          }
        },
      );
      if (!gen.reused) recordUsage(`Résumé generation${gen.model ? ` (${gen.model})` : ""}`, gen.usage);
      const file: AttachedFile = { name: gen.fileName, mimeType: gen.mimeType, base64: gen.pdfBase64 };
      setResumesByJobId((prev) => ({
        ...prev,
        [job.id]: {
          jobId: job.id,
          file,
          reused: gen.reused,
          generationId: gen.generationId,
          resumePdfPath: gen.resumePdfPath ?? null,
        },
      }));
      setResumeJobId(job.id);
      setResumeError(null);
      markPipeline(job.id, { resumeReady: true });
      const modelNote = gen.model ? ` · ${gen.provider ? `${gen.provider}/` : ""}${gen.model}` : "";
      const pathNote = gen.resumePdfPath ? ` · saved ${gen.resumePdfPath}` : "";
      pushLog(`Résumé ${gen.reused ? "reused" : "generated"} for "${job.title}"${modelNote}${pathNote}`, true);
      return file;
    },
    [applierName, markPipeline, pushLog, resumesByJobId],
  );

  /** Start résumé generation for a queued job (deduped per job id). */
  const startResumeForJob = useCallback(
    (job: QueuedJob, options?: { forceRegenerate?: boolean }): Promise<AttachedFile | null> => {
      if (isManualJob(job)) return Promise.resolve(null);
      if (!options?.forceRegenerate) {
        const inflight = resumeGenByJobIdRef.current.get(job.id);
        if (inflight) return inflight.then((file) => file);
      }

      const promise = (async () => {
        setGeneratingResume(true);
        setGeneratingResumeJobId(job.id);
        setResumeGenerateStep("Starting generation…");
        setResumeGeneratedSections({});
        setResumeJobId(job.id);
        setResumeError(null);
        try {
          return await ensureJobResume(job, options);
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Résumé generation failed";
          setResumeError(msg);
          pushLog(msg, false);
          throw error;
        } finally {
          setGeneratingResume(false);
          setGeneratingResumeJobId(null);
          setResumeGenerateStep(null);
          resumeGenByJobIdRef.current.delete(job.id);
        }
      })();

      resumeGenByJobIdRef.current.set(job.id, promise);
      return promise;
    },
    [ensureJobResume, pushLog],
  );

  const generateActiveJobResume = useCallback(
    async (forceRegenerate = false) => {
      const job = getActiveQueuedJob();
      if (!job) {
        pushLog("Select a queued job first", false);
        return;
      }
      if (isManualJob(job)) {
        pushLog(`"${job.title}" is manual — résumé generation needs a MongoDB job with description`, false);
        return;
      }
      try {
        await startResumeForJob(job, { forceRegenerate });
      } catch {
        /* logged in startResumeForJob */
      }
    },
    [getActiveQueuedJob, pushLog, startResumeForJob],
  );

  const getResumeForJob = useCallback(
    (job: QueuedJob): AttachedFile | null => {
      const entry = resumesByJobId[job.id];
      return entry?.file?.base64 ? entry.file : null;
    },
    [resumesByJobId],
  );

  const analyzeTree = useCallback(async () => {
    if (!actionableTree?.length) {
      pushLog("Fetch an actionable tree first", false);
      return;
    }
    if (!treePage?.tabId) {
      pushLog("No page context — scan the form on the target tab first", false);
      return;
    }
    if (!canExecute) {
      pushLog(executeDisabledReason ?? "Cannot execute", false);
      return;
    }

    setAnalyzing(true);
    try {
      const result = await analyzeFormFields({
        tree: actionableTree,
        applicantContext: applicantContext || undefined,
      });
      setFormAnalysis(result);
      recordUsage("Analyze form", result.usage);
      setGeneratedScript("");
      setFieldScriptsById({});
      setInjectionPlan(null);
      setSelectedTreeFieldId(null);
      const cost = result.usage?.cost?.totalUsd;
      pushLog(
        `Action plan: ${result.fields.length} field(s)${cost != null ? ` · $${cost.toFixed(6)}` : ""}`,
        true,
      );
      buildPlanFromFields(result.fields);
      const job = getActiveQueuedJob();
      if (job) markPipeline(job.id, { analyzed: true });
    } catch (error) {
      pushLog(error instanceof Error ? error.message : "Analysis failed", false);
    } finally {
      setAnalyzing(false);
    }
  }, [
    actionableTree,
    applicantContext,
    buildPlanFromFields,
    canExecute,
    executeDisabledReason,
    getActiveQueuedJob,
    markPipeline,
    pushLog,
    treePage,
  ]);

  const generatePlan = useCallback((): InjectionPlan | null => {
    if (!formAnalysis?.fields.length) {
      pushLog("Analyze the form first", false);
      return null;
    }
    return buildPlanFromFields(formAnalysis.fields);
  }, [buildPlanFromFields, formAnalysis?.fields.length, pushLog]);

  const highlightControl = useCallback(
    (control: TargetSelector) => {
      emitAction({
        id: createActionId(),
        tabId: selectedTabId === "" ? undefined : Number(selectedTabId),
        target: control,
        action: "highlight",
        payload: {},
      });
    },
    [emitAction, selectedTabId],
  );

  const selectTreeTarget = useCallback(
    (entry: ActionableTarget, id: string) => {
      setSelectedTreeFieldId(id);
      highlightControl(entry.control);
      const hasStep = Boolean(fieldScriptsById[id]);
      pushLog(
        `Selected "${entry.target}"${hasStep ? " — showing field step" : " — no step (skipped or no value)"}`,
      );
    },
    [fieldScriptsById, highlightControl, pushLog],
  );

  const requestTabs = useCallback(() => {
    socketRef.current?.emit(SOCKET_EVENTS.REQUEST_TABS);
    pushLog("Requested tab list");
  }, [pushLog]);

  const requestScreenshot = useCallback(() => {
    socketRef.current?.emit(SOCKET_EVENTS.REQUEST_SCREENSHOT, {
      tabId: selectedTabId === "" ? undefined : Number(selectedTabId),
    });
    pushLog("Requested screenshot");
  }, [pushLog, selectedTabId]);

  const navigateToJob = useCallback(
    (job: QueuedJob) => {
      if (!canExecute) {
        pushLog(executeDisabledReason ?? "Cannot navigate — extension not connected", false);
        return;
      }
      emitAction({
        id: createActionId(),
        tabId: selectedTabId === "" ? undefined : Number(selectedTabId),
        action: "navigate",
        payload: { url: job.url },
      });
      pushLog(`Navigating to ${job.title || job.url}`);
    },
    [canExecute, emitAction, executeDisabledReason, pushLog, selectedTabId],
  );

  const enqueueJobs = useCallback(
    (jobs: QueuedJob[]) => {
      setJobQueue(jobs);
      setActiveJobIndex(0);
      pushLog(`Queued ${jobs.length} job(s) for application`, true);
    },
    [pushLog],
  );

  /** Emit an action and resolve with its ACTION_RESULT (or reject on timeout). */
  const emitActionAsync = useCallback(
    (action: RemoteAction, timeoutMs = 120000): Promise<ActionResult> =>
      new Promise((resolve, reject) => {
        if (!socketRef.current?.connected) {
          reject(new Error("Not connected to relay"));
          return;
        }
        const timer = setTimeout(() => {
          pendingActionsRef.current.delete(action.id);
          reject(new Error(`Action "${action.action}" timed out`));
        }, timeoutMs);
        pendingActionsRef.current.set(action.id, (result) => {
          clearTimeout(timer);
          resolve(result);
        });
        socketRef.current.emit(SOCKET_EVENTS.EXECUTE_ACTION, action);
        pushLog(`Sent ${action.action} (${action.id})`);
      }),
    [pushLog],
  );

  const runApplyWithPlan = useCallback(
    async (plan: InjectionPlan, page: ActionablePageContext, resumeFile: AttachedFile) => {
      applyingRef.current = true;
      setApplying(true);
      try {
        const payload = buildApplyInjectionPlanPayload(plan, page, { autoSubmit: true, resumeFile });
        const applyRes = await emitActionAsync(
          {
            id: createActionId(),
            tabId: page.tabId,
            action: "apply_injection_plan",
            payload: payload as unknown as Record<string, unknown>,
          },
          180000,
        );
        if (!applyRes.success) throw new Error(applyRes.error || "Apply failed");
        const applyData = applyRes.data as
          | { submitted?: boolean; filesFound?: number; filesAttached?: number }
          | undefined;
        const filesFound = applyData?.filesFound ?? 0;
        const filesAttached = applyData?.filesAttached ?? 0;
        if (filesFound > 0 && filesAttached === 0) {
          throw new Error(`Résumé was not attached (${filesAttached}/${filesFound})`);
        }
        if (filesFound > 0) {
          pushLog(`Résumé uploaded to ${filesAttached}/${filesFound} field(s)`, filesAttached > 0);
        }
        pushLog(
          applyData?.submitted ? "Fill plan applied and submitted" : "Fill plan applied — review before submit",
          true,
        );
      } finally {
        applyingRef.current = false;
        setApplying(false);
      }
    },
    [emitActionAsync, pushLog],
  );

  const applyActionPlan = useCallback(async () => {
    if (!actionableTree?.length || !formAnalysis?.fields.length) {
      pushLog("Analyze the form first to build an action plan", false);
      return;
    }
    if (!treePage?.tabId) {
      pushLog("No page context — fetch the actionable tree on the target tab first", false);
      return;
    }
    if (!canExecute) {
      pushLog(executeDisabledReason ?? "Cannot execute", false);
      return;
    }

    const plan = injectionPlan ?? generatePlan();
    if (!plan || plan.steps.length === 0) {
      pushLog("No fill plan to apply", false);
      return;
    }

    const job = getActiveQueuedJob();
    if (!job || isManualJob(job)) {
      pushLog("Select a queued MongoDB job with a drafted résumé", false);
      return;
    }

    const resumeFile = getResumeForJob(job);
    if (!resumeFile) {
      pushLog("Generate tailored résumé first (step 1) — preview the PDF before applying", false);
      return;
    }

    try {
      await runApplyWithPlan(plan, treePage, resumeFile);
      setApplyDone(true);
      markPipeline(job.id, { applied: true });
    } catch (error) {
      pushLog(error instanceof Error ? error.message : "Apply failed", false);
    }
  }, [
    actionableTree?.length,
    canExecute,
    executeDisabledReason,
    formAnalysis?.fields.length,
    generatePlan,
    getActiveQueuedJob,
    getResumeForJob,
    injectionPlan,
    markPipeline,
    pushLog,
    runApplyWithPlan,
    treePage,
  ]);

  /** Open the active queue job URL in a new browser tab (step 2 — after résumé preview). */
  /** Close a tab (best-effort) via the extension. */
  const closeTab = useCallback(
    async (tabId: number) => {
      await emitActionAsync({ id: createActionId(), tabId, action: "close_tab", payload: {} }, 10000).catch(() => {});
    },
    [emitActionAsync],
  );

  /**
   * Validity gate — after a job tab is opened, read the page + scan its structure
   * and let the AI decide whether it's a live application form. Returns the scanned
   * tree/page so callers can reuse them (no double scan). Probing is off (fast).
   */
  const validateOpenedTab = useCallback(
    async (
      tabId: number,
      job: QueuedJob,
    ): Promise<{ validity: PageValidityResult; tree: ActionableTree | null; pageCtx: ActionablePageContext | null }> => {
      let text = "";
      let controlCount = 0;
      try {
        const st = await emitActionAsync(
          { id: createActionId(), tabId, action: "read_page_state", payload: {} },
          15000,
        );
        const d = (st.data as { text?: string; controlCount?: number } | undefined) ?? {};
        text = d.text ?? "";
        controlCount = d.controlCount ?? 0;
      } catch {
        /* read failed → treated as low signal below */
      }

      let tree: ActionableTree | null = null;
      let pageCtx: ActionablePageContext | null = null;
      try {
        const tr = await emitActionAsync(
          { id: createActionId(), tabId, action: "fetch_actionable_tree", payload: { probeComboboxes: false } },
          60000,
        );
        const d = (tr.data as { tree?: ActionableTree; page?: ActionablePageContext } | undefined) ?? {};
        tree = d.tree ?? null;
        pageCtx = d.page ?? null;
      } catch {
        /* scan failed */
      }
      const fieldCount = tree
        ? tree.reduce((n, g) => n + g.children.filter((c) => c.controlType !== "link").length, 0)
        : 0;

      const validity = await validateJobPage({
        text,
        title: pageCtx?.title,
        url: pageCtx?.url ?? job.url,
        fieldCount,
        controlCount,
      });
      recordUsage("Verify tab (AI)", validity.usage);
      return { validity, tree, pageCtx };
    },
    [emitActionAsync, recordUsage],
  );

  /** Pipeline step 2 — open the active job's URL in a fresh tab (open only). */
  const openActiveJob = useCallback(async () => {
    const job = getActiveQueuedJob();
    if (!job) {
      pushLog("Select a queued job first", false);
      return;
    }
    if (!canExecute) {
      pushLog(executeDisabledReason ?? "Cannot open job — extension not connected", false);
      return;
    }
    setTabValidity(null);
    setVerifyResult(null);
    setApplyDone(false);
    resetJobUsage();
    try {
      const opened = await emitActionAsync({
        id: createActionId(),
        action: "open_tab",
        payload: { url: job.url },
      });
      if (!opened.success) throw new Error(opened.error || "Failed to open tab");
      const openedData = opened.data as { tabId?: number; page?: ActionablePageContext };
      const tabId = openedData.tabId;
      setActionableTree(null);
      setFormAnalysis(null);
      setInjectionPlan(null);
      setGeneratedScript("");
      setFieldScriptsById({});
      setSelectedTreeFieldId(null);
      setTabValidity(null);
      setVerifyResult(null);
      setApplyDone(false);
      if (tabId) setSelectedTabId(tabId);
      setTreePage(openedData.page ?? null);
      markPipeline(job.id, {
        opened: true,
        validated: false,
        scanned: false,
        analyzed: false,
        applied: false,
        verified: false,
      });
      pushLog(`Opened "${job.title}" — verify it's a valid application form next`, true);
    } catch (error) {
      pushLog(error instanceof Error ? error.message : "Failed to open job", false);
    }
  }, [canExecute, emitActionAsync, executeDisabledReason, getActiveQueuedJob, markPipeline, pushLog]);

  /**
   * Pipeline step 3 — verify the opened tab is a live job-application form. If it's
   * expired / not found / an error / not a form, close the tab and mark the job
   * handled so the queue moves on (per the requested flow).
   */
  const validateActiveTab = useCallback(async () => {
    const job = getActiveQueuedJob();
    const tabId = treePage?.tabId ?? (typeof selectedTabId === "number" ? selectedTabId : undefined);
    if (!tabId) {
      pushLog("Open the job link first (step 2)", false);
      return;
    }
    if (!canExecute) {
      pushLog(executeDisabledReason ?? "Cannot verify — extension not connected", false);
      return;
    }
    setValidatingTab(true);
    setTabValidity(null);
    try {
      const jobForCheck: QueuedJob =
        job ?? { id: "", title: treePage?.title ?? "this application", company: "", url: treePage?.url ?? "", source: "" };
      const { validity } = await validateOpenedTab(tabId, jobForCheck);
      setTabValidity(validity);
      if (validity.valid) {
        if (job) markPipeline(job.id, { validated: true });
        pushLog(`Valid application form — ${validity.reason}`, true);
      } else {
        pushLog(`Not a usable form (${validity.kind}) — ${validity.reason}; closing tab`, false);
        await closeTab(tabId);
        if (job) {
          setAppliedJobIds((prev) => new Set(prev).add(job.id));
          if (!isManualJob(job) && applierName) {
            try {
              await applyToJob(job.id, applierName);
            } catch {
              /* non-fatal */
            }
          }
        }
      }
    } catch (error) {
      pushLog(error instanceof Error ? error.message : "Validity check failed", false);
    } finally {
      setValidatingTab(false);
    }
  }, [
    applierName,
    canExecute,
    closeTab,
    executeDisabledReason,
    getActiveQueuedJob,
    markPipeline,
    pushLog,
    selectedTabId,
    treePage,
    validateOpenedTab,
  ]);

  /** Read the post-submit page (innerText + remaining control count) via CSP-safe read_page_state. */
  const readApplyPageState = useCallback(
    async (tabId: number, submitted: boolean) => {
      try {
        const res = await emitActionAsync(
          {
            id: createActionId(),
            tabId,
            action: "read_page_state",
            payload: {},
          },
          15000,
        );
        const data = (res.data as { text?: string; controlCount?: number } | undefined) ?? {};
        return { text: data.text ?? "", controlCount: data.controlCount ?? 0, submitted };
      } catch {
        return { text: "", controlCount: 0, submitted };
      }
    },
    [emitActionAsync],
  );

  /** Mark a (non-manual) queued job Applied in the pipeline and badge it locally. */
  const markJobApplied = useCallback(
    async (job: QueuedJob) => {
      setAppliedJobIds((prev) => new Set(prev).add(job.id));
      if (job.source === "manual" || job.id.startsWith("manual:") || !applierName) return;
      try {
        await applyToJob(job.id, applierName);
      } catch (error) {
        pushLog(`Could not mark "${job.title}" applied: ${error instanceof Error ? error.message : error}`, false);
      }
    },
    [applierName, pushLog],
  );

  /**
   * Verify the post-submit outcome with the AI: wait for the page to settle after
   * the submit click, read its innerText, and let the model decide success vs a
   * verification-code step vs errors — far more reliable than phrase matching.
   * Falls back to the heuristic classifier only if the AI call fails.
   */
  const verifyAfterSubmit = useCallback(
    async (
      tabId: number,
      job: QueuedJob,
      submitted: boolean,
      settleMs = 5000,
    ): Promise<{ verdict: ApplyVerifyResult; state: ApplyPageState }> => {
      await emitActionAsync(
        { id: createActionId(), tabId, action: "wait", payload: { ms: settleMs } },
        settleMs + 5000,
      ).catch(() => {});
      const state = await readApplyPageState(tabId, submitted);
      try {
        const verdict = await verifyApplyOutcome({ pageText: state.text, jobTitle: job.title, controlCount: state.controlCount });
        recordUsage("Verify result (AI)", verdict.usage);
        pushLog(`Verify (AI): ${verdict.status} — ${verdict.reason}`, verdict.status === "success");
        return { verdict, state };
      } catch (error) {
        const outcome = classifyApplyOutcome(state);
        pushLog(
          `Verify (AI failed, using heuristic): ${outcome.applied ? "success" : "unconfirmed"} — ${error instanceof Error ? error.message : error}`,
          outcome.applied,
        );
        return {
          verdict: { status: outcome.applied ? "success" : "incomplete", reason: outcome.reason },
          state,
        };
      }
    },
    [emitActionAsync, pushLog, readApplyPageState],
  );

  /**
   * Manual pipeline step 6 — "Verify result". Reads the current page and classifies
   * the outcome into one of three results the user asked for: success / failed
   * (with reason) / additional process required (OTP, email verification code/link).
   */
  const verifyActiveResult = useCallback(async () => {
    const job = getActiveQueuedJob();
    const tabId = treePage?.tabId ?? (typeof selectedTabId === "number" ? selectedTabId : undefined);
    if (!tabId) {
      pushLog("No tab to verify — open the job and scan the form first", false);
      return;
    }
    if (!canExecute) {
      pushLog(executeDisabledReason ?? "Cannot verify — extension not connected", false);
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const jobForVerify: QueuedJob =
        job ?? { id: "", title: treePage?.title ?? "this application", company: "", url: treePage?.url ?? "", source: "" };
      // Short settle — by step 6 the page has already been submitted by step 5.
      const { verdict } = await verifyAfterSubmit(tabId, jobForVerify, true, 1500);

      let result: ManualVerifyResult;
      if (verdict.status === "success") {
        result = { kind: "success", reason: verdict.reason || "Application submitted." };
        if (job) await markJobApplied(job);
      } else if (verdict.status === "needs_verification") {
        // OTP / email verification — pull the code OR a verify link from the inbox
        // (regex + AI extractor), poll a few times since the email lags, then fill +
        // submit (CSP-safe) or open the link, and re-verify.
        let otp: Awaited<ReturnType<typeof requestVerificationCode>> = { code: null, link: null };
        if (applierName) {
          for (let poll = 0; poll < 4 && !otp.code && !otp.link; poll += 1) {
            if (poll > 0) {
              await emitActionAsync({ id: createActionId(), tabId, action: "wait", payload: { ms: 4000 } }).catch(() => {});
            }
            otp = await requestVerificationCode(applierName);
          }
        }
        // Surface exactly what was read from the inbox (visibility the user asked for).
        const readNote = otp.code
          ? `Read code “${otp.code}”${otp.from ? ` from ${otp.from}` : ""}${otp.via ? ` (${otp.via})` : ""}`
          : otp.link
            ? `Read verify link${otp.from ? ` from ${otp.from}` : ""}${otp.via ? ` (${otp.via})` : ""}`
            : `No code/link in the inbox yet${otp.scanned ? ` (scanned ${otp.scanned} email(s))` : ""}`;
        pushLog(readNote, Boolean(otp.code || otp.link));

        if (otp.code) {
          pushLog(`Filling verification code ${otp.code} and submitting…`, true);
          const fill = await emitActionAsync(
            { id: createActionId(), tabId, action: "fill_verification_code", payload: { code: otp.code } },
            20000,
          ).catch((e) => ({ success: false, error: String(e) }) as ActionResult);
          const filled = (fill.data as { filled?: number; expected?: number; clicked?: boolean } | undefined) ?? {};
          const after = await verifyAfterSubmit(tabId, jobForVerify, true, 4000);
          if (after.verdict.status === "success") {
            result = { kind: "success", reason: `Verified with emailed code — ${after.verdict.reason}` };
            if (job) await markJobApplied(job);
          } else {
            result = {
              kind: "additional",
              reason: `Entered code ${otp.code} into ${filled.filled ?? 0}/${filled.expected ?? "?"} box(es), submit ${filled.clicked ? "clicked" : "not found"}`,
              detail: `Still not confirmed (${after.verdict.status}): ${after.verdict.reason}. Click Verify again to retry.`,
            };
          }
        } else if (otp.link) {
          // Click-to-verify flow — open the link in the same tab, then re-verify.
          pushLog(`Opening verification link…`, true);
          await emitActionAsync({ id: createActionId(), tabId, action: "navigate", payload: { url: otp.link } }, 30000).catch(() => {});
          const after = await verifyAfterSubmit(tabId, jobForVerify, true, 5000);
          if (after.verdict.status === "success") {
            result = { kind: "success", reason: `Verified via emailed link — ${after.verdict.reason}` };
            if (job) await markJobApplied(job);
          } else {
            result = {
              kind: "additional",
              reason: "Opened the emailed verification link",
              detail: `Not confirmed yet (${after.verdict.status}): ${after.verdict.reason}. Click Verify again.`,
            };
          }
        } else {
          result = {
            kind: "additional",
            reason: verdict.reason || "Verification required.",
            detail: `${readNote} — click Verify again once the email arrives.`,
          };
        }
      } else {
        result = {
          kind: "failed",
          reason: verdict.reason || "Could not confirm the application.",
          detail: "Re-run 5 · Scan DOM → 6 · Analyze → 7 · Apply, then 8 · Verify again.",
        };
      }
      setVerifyResult(result);
      if (result.kind === "success" && job) markPipeline(job.id, { verified: true });
      pushLog(`Verify result: ${result.kind} — ${result.reason}`, result.kind === "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Verify failed";
      setVerifyResult({ kind: "failed", reason: msg });
      pushLog(msg, false);
    } finally {
      setVerifying(false);
    }
  }, [
    applierName,
    canExecute,
    emitActionAsync,
    executeDisabledReason,
    getActiveQueuedJob,
    markJobApplied,
    markPipeline,
    pushLog,
    selectedTabId,
    treePage,
    verifyAfterSubmit,
  ]);

  /** Explicitly mark the active queued job Applied to MongoDB with the current profile. */
  const markActiveJobApplied = useCallback(async () => {
    const job = getActiveQueuedJob();
    if (!job) {
      pushLog("Select a queued job to mark applied", false);
      return;
    }
    if (isManualJob(job) || !applierName) {
      pushLog("Manual/link-only jobs can't be marked applied in the pipeline", false);
      return;
    }
    await markJobApplied(job);
    pushLog(`Marked "${job.title}" as Applied for ${applierName}`, true);
  }, [applierName, getActiveQueuedJob, markJobApplied, pushLog]);

  /**
   * Re-scan the page's actionable tree for the recovery loop. Dropdown/combobox
   * option probing is intentionally OFF here — recovery only needs the field
   * structure + labels, and probing adds latency the retry loop can't afford.
   */
  const rescanTree = useCallback(
    async (tabId: number): Promise<ActionableTree | null> => {
      try {
        const res = await emitActionAsync(
          {
            id: createActionId(),
            tabId,
            action: "fetch_actionable_tree",
            payload: { probeComboboxes: false },
          },
          60000,
        );
        const data = res.data as { tree?: ActionableTree } | undefined;
        return data?.tree ?? null;
      } catch {
        return null;
      }
    },
    [emitActionAsync],
  );

  /**
   * Phase C — self-healing retry. When an apply doesn't confirm, hand the AI the
   * live DOM + previous plan + failures; it authors an `execute_script` recovery
   * snippet (which also clicks Submit). Re-read + re-classify each round, up to 10×.
   * Returns true if the application was confirmed and marked Applied.
   */
  const runRecoveryLoop = useCallback(
    async (params: {
      tabId: number;
      job: QueuedJob;
      planSteps: InjectionPlan["steps"];
      firstState: ApplyPageState;
      firstReason: string;
      firstResults?: StepRunResult[];
      resumeFile?: AttachedFile;
      pageCtx?: ActionablePageContext;
    }): Promise<boolean> => {
      const { tabId, job, planSteps, resumeFile, pageCtx } = params;
      let state = params.firstState;
      let reason = params.firstReason;
      let lastResults: StepRunResult[] = params.firstResults ?? [];

      // The AI recovery script runs in the isolated world and CANNOT set
      // input.files. So on the first recovery pass, re-run the résumé attach via
      // the executor's MAIN-world path — this fixes a genuine upload miss (which
      // recovery could otherwise never repair).
      const fileSteps = planSteps.filter((s) => s.op === "attachFile");
      if (fileSteps.length > 0 && resumeFile) {
        try {
          pushLog(`Recovery: re-attaching résumé via MAIN world…`, true);
          await emitActionAsync(
            {
              id: createActionId(),
              tabId,
              action: "apply_injection_plan",
              payload: buildApplyInjectionPlanPayload({ steps: fileSteps }, pageCtx ?? { tabId, url: job.url }, {
                autoSubmit: false,
                resumeFile,
              }) as unknown as Record<string, unknown>,
            },
            60000,
          );
        } catch (error) {
          pushLog(`Recovery: résumé re-attach failed — ${error instanceof Error ? error.message : error}`, false);
        }
      }

      for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt += 1) {
        setApplyPhase({
          phase: "fields",
          message: `Self-healing attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS} — ${reason}`,
          at: Date.now(),
        });

        const tree = await rescanTree(tabId);
        if (!tree) {
          pushLog(`Recovery ${attempt}: could not re-scan the page`, false);
          break;
        }

        // Phase D — if the page is asking for an emailed code, pull the latest one
        // from the applier's inbox (IMAP). The email lags the submit by a few
        // seconds, so poll a few times before giving up this attempt.
        // Also check the re-scanned tree for verification-code input patterns as a
        // fallback (e.g. "Security code", single-char inputs) in case the page text
        // is incomplete or the regex missed the cue.
        let otpCode: string | null = null;
        const treeHasVerificationInputs = tree.some((g) =>
          g.children.some(
            (c) =>
              /\b(security code|verification code|enter the code|one[- ]?time code|otp|passcode)\b/i.test(
                c.target,
              ) ||
              (c.controlType === 'text' &&
                c.target.includes('code') &&
                g.children.filter((cc) => cc.controlType === 'text').length >= 4),
          ),
        );
        const shouldCheckEmail =
          applierName &&
          (VERIFICATION_CUE.test(state.text) || treeHasVerificationInputs);

        if (shouldCheckEmail) {
          pushLog(
            `Recovery ${attempt}: verification detected — checking email (${treeHasVerificationInputs ? 'tree' : 'text'} cue)…`,
            true,
          );
          for (let poll = 0; poll < 5 && !otpCode; poll += 1) {
            if (poll > 0) {
              await emitActionAsync({ id: createActionId(), tabId, action: "wait", payload: { ms: 5000 } }).catch(() => {});
            }
            // Widen the email lookback window on later polls — verification emails
            // can take 30-60s to arrive, and Gmail's IMAP sync has inherent latency.
            const sinceMs = poll < 2 ? undefined : (poll + 1) * 60_000;
            const otp = await requestVerificationCode(applierName, sinceMs);
            otpCode = otp.code;
            if (otpCode) {
              pushLog(
                `Recovery ${attempt}: got code from email (poll ${poll + 1}, subject: ${otp.subject ?? 'unknown'})`,
                true,
              );
            }
          }
          if (!otpCode) {
            pushLog(`Recovery ${attempt}: no verification code in email after 5 polls`, false);
          }
        }

        let recovery;
        try {
          recovery = await generateRecoveryScript({
            jobTitle: job.title,
            pageUrl: job.url,
            pageText: state.text,
            outcomeReason: reason,
            previousPlan: planSteps.map((s) => ({ id: s.id, label: s.label, op: s.op, value: s.value })),
            stepResults: lastResults,
            tree,
            attempt,
            maxAttempts: MAX_RECOVERY_ATTEMPTS,
            applicantContext: applicantContext || undefined,
            otpCode,
          });
          recordUsage(`Recovery ${attempt} (AI)`, recovery.usage);
        } catch (error) {
          pushLog(`Recovery ${attempt}: AI failed — ${error instanceof Error ? error.message : error}`, false);
          continue;
        }

        if (recovery.reasoning) pushLog(`Recovery ${attempt}: ${recovery.reasoning}`, true);

        let scriptError: string | null = null;
        try {
          const scriptRes = await emitActionAsync(
            {
              id: createActionId(),
              tabId,
              action: "execute_script",
              payload: { source: recovery.script },
            },
            60000,
          );
          if (!scriptRes.success) {
            scriptError = scriptRes.error ?? "unknown";
            pushLog(`Recovery ${attempt}: script error — ${scriptRes.error}`, false);
          }
        } catch (error) {
          scriptError = error instanceof Error ? error.message : String(error);
          pushLog(`Recovery ${attempt}: script threw — ${scriptError}`, false);
        }
        logRunData("recovery", {
          attempt,
          reason,
          otpCode: otpCode ? "(fetched)" : null,
          reasoning: recovery.reasoning,
          script: recovery.script,
          scriptError,
          pageTextBefore: state.text,
        });

        // Re-verify with the AI (settles the page, reads innerText, classifies).
        lastResults = [];
        const { verdict, state: newState } = await verifyAfterSubmit(tabId, job, true, 3000);
        state = newState;
        logRunData("recovery-verify", { attempt, status: verdict.status, reason: verdict.reason, pageText: newState.text });
        if (verdict.status === "success") {
          pushLog(`"${job.title}" recovered on attempt ${attempt} — ${verdict.reason}`, true);
          await markJobApplied(job);
          return true;
        }
        reason = verdict.reason || verdict.status;
      }

      pushLog(`"${job.title}" still unconfirmed after ${MAX_RECOVERY_ATTEMPTS} recovery attempts`, false);
      return false;
    },
    [applicantContext, applierName, emitActionAsync, markJobApplied, pushLog, rescanTree, verifyAfterSubmit, logRunData],
  );

  /**
   * Drive one job end-to-end: draft résumé → open tab → scan → analyze → fill → submit.
   */
  const applyJob = useCallback(
    async (job: QueuedJob) => {
      if (!canExecute) {
        pushLog(executeDisabledReason ?? "Cannot apply — extension not connected", false);
        return;
      }
      setApplying(true);
      applyingRef.current = true;
      setApplyDone(false);
      resetJobUsage();
      startRunLog(job, { url: job.url, company: job.company, source: job.source });
      let finalStatus = "failed";
      try {
        pushLog(`Applying to "${job.title}"…`, true);
        let resumeFile = getResumeForJob(job);
        const preGenerated = Boolean(resumeFile);
        if (!resumeFile) {
          resumeFile = await startResumeForJob(job);
        }
        if (!resumeFile) throw new Error("Tailored résumé PDF is required but was not generated");
        logRunData("resume", {
          fileName: resumeFile.name,
          mimeType: resumeFile.mimeType,
          base64Bytes: resumeFile.base64?.length ?? 0,
          preGenerated,
          reused: resumesByJobId[job.id]?.reused ?? null,
        });

        const opened = await emitActionAsync({
          id: createActionId(),
          action: "open_tab",
          payload: { url: job.url },
        });
        if (!opened.success) throw new Error(opened.error || "Failed to open tab");
        const openedData = opened.data as { tabId?: number; page?: ActionablePageContext };
        const tabId = openedData.tabId;
        if (!tabId) throw new Error("open_tab returned no tab id");
        setSelectedTabId(tabId);

        // Validity gate — skip dead/expired/non-form links (close tab + mark handled).
        const gate = await validateOpenedTab(tabId, job);
        logRunData("validity", { kind: gate.validity.kind, valid: gate.validity.valid, reason: gate.validity.reason });
        if (!gate.validity.valid) {
          pushLog(`"${job.title}" skipped — ${gate.validity.kind}: ${gate.validity.reason}`, false);
          setVerifyResult({ kind: "failed", reason: `Link not usable (${gate.validity.kind})`, detail: gate.validity.reason });
          await closeTab(tabId);
          await markJobApplied(job);
          finalStatus = `skipped-${gate.validity.kind}`;
          return;
        }

        const treeRes = await emitActionAsync({
          id: createActionId(),
          tabId,
          action: "fetch_actionable_tree",
          payload: { probeComboboxes },
        });
        if (!treeRes.success) throw new Error(treeRes.error || "Form scan failed");
        const treeData = treeRes.data as { tree?: ActionableTree; page?: ActionablePageContext };
        const tree = treeData.tree;
        const pageCtx = treeData.page ?? openedData.page;
        if (!tree?.length || !pageCtx) throw new Error("No fillable fields found on the page");
        logRunData("scan", {
          url: pageCtx.url,
          groups: tree.length,
          fields: tree.flatMap((g) =>
            g.children.map((c) => ({ group: g.content?.slice(0, 40), target: c.target, controlType: c.controlType })),
          ),
        });

        setAnalyzing(true);
        const analysis = await analyzeFormFields({ tree, applicantContext: applicantContext || undefined });
        setAnalyzing(false);
        setActionableTree(tree);
        setTreePage(pageCtx);
        setFormAnalysis(analysis);
        logRunData("analyze", {
          fields: analysis.fields.map((f) => ({ id: f.id, action: f.action, shouldSkip: f.shouldSkip, value: f.value })),
          usage: analysis.usage ?? null,
        });

        const built = buildFormInjectionPlan({ tree, fields: analysis.fields });
        setInjectionPlan(built.plan);
        setGeneratedScript(built.preview);
        if (!built.plan.steps.length) throw new Error("Plan has no fillable steps");
        logRunData("plan", {
          steps: built.plan.steps.map((s) => ({ id: s.id, label: s.label, op: s.op, value: s.value })),
          fileSteps: built.plan.steps.filter((s) => s.op === "attachFile").length,
        });

        const payload = buildApplyInjectionPlanPayload(built.plan, pageCtx, { autoSubmit: true, resumeFile });
        const applyRes = await emitActionAsync(
          {
            id: createActionId(),
            tabId,
            action: "apply_injection_plan",
            payload: payload as unknown as Record<string, unknown>,
          },
          180000,
        );
        if (!applyRes.success) throw new Error(applyRes.error || "Apply failed");
        const applyData = applyRes.data as
          | { submitted?: boolean; result?: StepRunResult[]; filesFound?: number; filesAttached?: number }
          | undefined;
        setApplyDone(true);
        const submitted = Boolean(applyData?.submitted);
        const firstResults = Array.isArray(applyData?.result) ? applyData!.result : [];

        // Résumé-upload status — informational only. A 0/N reading is often a
        // false negative (a dropzone briefly resets the input), so we NEVER abort
        // on it; the AI verify below reads the real page and decides the outcome.
        const filesFound = applyData?.filesFound ?? 0;
        const filesAttached = applyData?.filesAttached ?? 0;
        logRunData("apply-result", { filesFound, filesAttached, submitted, results: firstResults });
        if (filesFound === 0) {
          pushLog(`Résumé: no file field detected on "${job.title}"`, false);
        } else {
          pushLog(`Résumé attach reported ${filesAttached}/${filesFound} — verifying on page…`, filesAttached > 0);
        }

        // AI verify: wait 5s for the page to settle, read innerText, classify.
        const { verdict, state: pageState } = await verifyAfterSubmit(tabId, job, submitted, 5000);
        logRunData("verify", { status: verdict.status, reason: verdict.reason, pageText: pageState.text, controlCount: pageState.controlCount });
        if (verdict.status === "success") {
          pushLog(`"${job.title}" applied — ${verdict.reason}`, true);
          await markJobApplied(job);
          finalStatus = "applied";
        } else {
          // needs_verification / error / incomplete → self-healing loop (OTP,
          // missing fields, blocks). Re-scan uses probe-off; up to 10×.
          pushLog(`"${job.title}" not confirmed (${verdict.status}) — ${verdict.reason}; starting self-healing`, false);
          const recovered = await runRecoveryLoop({
            tabId,
            job,
            planSteps: built.plan.steps,
            firstState: pageState,
            firstReason: verdict.reason || verdict.status,
            firstResults,
            resumeFile,
            pageCtx,
          });
          finalStatus = recovered ? "applied-recovered" : "unconfirmed";
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Apply failed";
        pushLog(msg, false);
        logRunData("error", { message: msg, stack: error instanceof Error ? error.stack : null });
        finalStatus = "error";
      } finally {
        setAnalyzing(false);
        setApplying(false);
        applyingRef.current = false;
        endRunLog(finalStatus);
      }
    },
    [applicantContext, canExecute, emitActionAsync, getResumeForJob, startResumeForJob, executeDisabledReason, markJobApplied, probeComboboxes, pushLog, runRecoveryLoop, verifyAfterSubmit, startRunLog, logRunData, endRunLog, resumesByJobId, validateOpenedTab, closeTab],
  );

  /** Apply every queued job in sequence — each opens its own tab and auto-submits. */
  const applyQueue = useCallback(async () => {
    if (!jobQueue.length) {
      pushLog("Queue is empty — add jobs first", false);
      return;
    }
    for (let i = 0; i < jobQueue.length; i += 1) {
      setActiveJobIndex(i);
      await applyJob(jobQueue[i]);
    }
    pushLog(`Queue complete · ${jobQueue.length} job(s) processed`, true);
  }, [applyJob, jobQueue, pushLog]);

  const selectActiveJob = useCallback(
    (index: number) => {
      const job = jobQueue[index];
      resetJobWorkspace();
      setActiveJobIndex(index);
      if (job) {
        setResumeJobId(job.id);
        if (resumesByJobId[job.id]?.file?.base64) {
          markPipeline(job.id, { resumeReady: true });
        }
      }
    },
    [jobQueue, markPipeline, resetJobWorkspace, resumesByJobId],
  );

  const activePipeline = useMemo((): JobPipelineState => {
    const job = jobQueue[activeJobIndex];
    if (!job) return EMPTY_PIPELINE;
    const stored = pipelineByJobId[job.id] ?? EMPTY_PIPELINE;
    return {
      ...stored,
      resumeReady: stored.resumeReady || Boolean(resumesByJobId[job.id]?.file?.base64),
    };
  }, [activeJobIndex, jobQueue, pipelineByJobId, resumesByJobId]);

  const isGeneratingActiveResume =
    generatingResume && generatingResumeJobId === jobQueue[activeJobIndex]?.id;

  return {
    serverUrl,
    setServerUrl,
    sessionId,
    setSessionId,
    connected,
    registered,
    peers,
    tabs,
    selectedTabId,
    setSelectedTabId,
    logs,
    screenshot,
    actionableTree,
    treePage,
    formAnalysis,
    displayedScript,
    fieldScriptsById,
    injectionPlan,
    selectedTreeFieldId,
    setSelectedTreeFieldId,
    analyzing,
    applying,
    canExecute,
    executeDisabledReason,
    actionPlanByFieldId,
    jobQueue,
    activeJobIndex,
    selectActiveJob,
    activePipeline,
    appliedJobIds,
    resumesByJobId,
    activeResume: resumeJobId ? resumesByJobId[resumeJobId] ?? null : null,
    generatingResume: isGeneratingActiveResume,
    resumeGenerateStep,
    resumeGeneratedSections,
    resumeError,
    applyPhase,
    verifyResult,
    verifying,
    verifyActiveResult,
    setVerifyResult,
    tabValidity,
    validatingTab,
    validateActiveTab,
    applyDone,
    jobUsage,
    markActiveJobApplied,
    socketRef,
    connect,
    fetchActionableTree,
    analyzeTree,
    generatePlan,
    generateActiveJobResume,
    openActiveJob,
    applyActionPlan,
    selectTreeTarget,
    requestTabs,
    requestScreenshot,
    navigateToJob,
    enqueueJobs,
    applyJob,
    applyQueue,
    pushLog,
  };
}
