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
import { applyToJob, fetchJobDescription, generateJobResume } from "../../../api/jobs";
import { requestVerificationCode } from "../../../api/mail";
import { classifyApplyOutcome, type ApplyPageState } from "../lib/applyOutcome";
import { generateRecoveryScript } from "../avalon/ai/recover-apply";

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

/** A generated per-job résumé held for attach + preview. */
export interface JobResume {
  jobId: string;
  file: AttachedFile;
  reused: boolean;
  generationId: string | null;
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
  const [monitorMode, setMonitorMode] = useState<"webrtc" | "screenshot">("screenshot");
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [resumesByJobId, setResumesByJobId] = useState<Record<string, JobResume>>({});
  const [resumeJobId, setResumeJobId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const applyingRef = useRef(false);
  const pendingActionsRef = useRef<Map<string, (result: ActionResult) => void>>(new Map());
  const sessionIdRef = useRef(sessionId);
  const selectedTabIdRef = useRef(selectedTabId);
  sessionIdRef.current = sessionId;
  selectedTabIdRef.current = selectedTabId;

  const canExecute = connected && peers.extension;
  const executeDisabledReason = !connected
    ? "Connect to the Avalon relay server first."
    : !peers.extension
      ? `Extension not on session "${sessionId || DEFAULT_SESSION_ID}". Install the Avalon extension and match the session ID.`
      : null;

  const pushLog = useCallback((message: string, success?: boolean) => {
    setLogs((prev) => [
      {
        id: `${Date.now()}_${Math.random()}`,
        at: new Date().toLocaleTimeString(),
        message,
        success,
      },
      ...prev.slice(0, 49),
    ]);
  }, []);

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
      setApplyPhase(progress);
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
  }, [pushLog, serverUrl]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.removeAllListeners();
      socketRef.current?.disconnect();
    };
  }, [connect]);

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

  const analyzeTree = useCallback(async () => {
    if (!actionableTree?.length) {
      pushLog("Fetch an actionable tree first", false);
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeFormFields({
        tree: actionableTree,
        applicantContext: applicantContext || undefined,
      });
      setFormAnalysis(result);
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
    } catch (error) {
      pushLog(error instanceof Error ? error.message : "Analysis failed", false);
    } finally {
      setAnalyzing(false);
    }
  }, [actionableTree, applicantContext, buildPlanFromFields, pushLog]);

  const generatePlan = useCallback((): InjectionPlan | null => {
    if (!formAnalysis?.fields.length) {
      pushLog("Analyze the form first", false);
      return null;
    }
    return buildPlanFromFields(formAnalysis.fields);
  }, [buildPlanFromFields, formAnalysis?.fields.length, pushLog]);

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

    applyingRef.current = true;
    setApplying(true);

    try {
      const plan = injectionPlan ?? generatePlan();
      if (!plan || plan.steps.length === 0) {
        applyingRef.current = false;
        setApplying(false);
        pushLog("No fill plan to apply", false);
        return;
      }

      const payload = buildApplyInjectionPlanPayload(plan, treePage);
      emitAction({
        id: createActionId(),
        tabId: treePage.tabId,
        action: "apply_injection_plan",
        payload: payload as unknown as Record<string, unknown>,
      });
      pushLog(`Applying fill plan (${plan.steps.length} steps) on tab ${treePage.tabId}…`);
    } catch (error) {
      applyingRef.current = false;
      setApplying(false);
      pushLog(error instanceof Error ? error.message : "Apply failed", false);
    }
  }, [
    actionableTree?.length,
    canExecute,
    emitAction,
    executeDisabledReason,
    formAnalysis?.fields.length,
    generatePlan,
    injectionPlan,
    pushLog,
    treePage,
  ]);

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

  /** Read the post-submit page (innerText + remaining control count) via execute_script. */
  const readApplyPageState = useCallback(
    async (tabId: number, submitted: boolean) => {
      try {
        const res = await emitActionAsync(
          {
            id: createActionId(),
            tabId,
            action: "execute_script",
            payload: {
              source:
                "const c=document.querySelectorAll('input:not([type=hidden]):not([disabled]),textarea,select,[contenteditable=\"true\"]');return {text:(document.body.innerText||'').slice(0,4000),controlCount:c.length};",
            },
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

  /** Re-scan the page's actionable tree (probing on) for the recovery loop. */
  const rescanTree = useCallback(
    async (tabId: number): Promise<ActionableTree | null> => {
      try {
        const res = await emitActionAsync(
          {
            id: createActionId(),
            tabId,
            action: "fetch_actionable_tree",
            payload: { probeComboboxes },
          },
          60000,
        );
        const data = res.data as { tree?: ActionableTree } | undefined;
        return data?.tree ?? null;
      } catch {
        return null;
      }
    },
    [emitActionAsync, probeComboboxes],
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
    }): Promise<boolean> => {
      const { tabId, job, planSteps } = params;
      let state = params.firstState;
      let reason = params.firstReason;
      let lastResults: StepRunResult[] = params.firstResults ?? [];

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

        // Phase D — if the page is asking for an emailed code, pull the latest
        // one from the applier's inbox (IMAP) so the recovery script can fill it.
        let otpCode: string | null = null;
        if (applierName && VERIFICATION_CUE.test(state.text)) {
          pushLog(`Recovery ${attempt}: verification code requested — checking email…`, true);
          const otp = await requestVerificationCode(applierName);
          otpCode = otp.code;
          pushLog(
            otpCode ? `Recovery ${attempt}: got code from email` : `Recovery ${attempt}: no code found in email yet`,
            Boolean(otpCode),
          );
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
        } catch (error) {
          pushLog(`Recovery ${attempt}: AI failed — ${error instanceof Error ? error.message : error}`, false);
          continue;
        }

        if (recovery.reasoning) pushLog(`Recovery ${attempt}: ${recovery.reasoning}`, true);

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
            pushLog(`Recovery ${attempt}: script error — ${scriptRes.error}`, false);
          }
        } catch (error) {
          pushLog(`Recovery ${attempt}: script threw — ${error instanceof Error ? error.message : error}`, false);
        }

        // Give the page a moment to react/navigate, then re-read + re-classify.
        await emitActionAsync({ id: createActionId(), tabId, action: "wait", payload: { ms: 1500 } }).catch(() => {});
        state = await readApplyPageState(tabId, true);
        lastResults = [];
        const outcome = classifyApplyOutcome(state);
        if (outcome.applied) {
          pushLog(`"${job.title}" recovered on attempt ${attempt} — ${outcome.reason}`, true);
          await markJobApplied(job);
          return true;
        }
        reason = outcome.reason;
      }

      pushLog(`"${job.title}" still unconfirmed after ${MAX_RECOVERY_ATTEMPTS} recovery attempts`, false);
      return false;
    },
    [applicantContext, applierName, emitActionAsync, markJobApplied, pushLog, readApplyPageState, rescanTree],
  );

  /**
   * Generate (or reuse) a per-job résumé tailored to the JD and cache it for
   * attach + preview. Returns null for manual/link-only jobs or on any failure —
   * the executor then falls back to the bundled default résumé.
   */
  const ensureJobResume = useCallback(
    async (job: QueuedJob): Promise<AttachedFile | null> => {
      if (!applierName || isManualJob(job)) return null;
      const cached = resumesByJobId[job.id];
      if (cached) {
        setResumeJobId(job.id);
        return cached.file;
      }
      try {
        const jd = await fetchJobDescription(job.id);
        if (!jd) {
          pushLog(`No job description for "${job.title}" — using default résumé`, false);
          return null;
        }
        pushLog(`Generating tailored résumé for "${job.title}"…`, true);
        const gen = await generateJobResume({ applierName, jobId: job.id, jobDescription: jd });
        const file: AttachedFile = { name: gen.fileName, mimeType: gen.mimeType, base64: gen.pdfBase64 };
        setResumesByJobId((prev) => ({
          ...prev,
          [job.id]: { jobId: job.id, file, reused: gen.reused, generationId: gen.generationId },
        }));
        setResumeJobId(job.id);
        pushLog(`Résumé ${gen.reused ? "reused" : "generated"} for "${job.title}"`, true);
        return file;
      } catch (error) {
        pushLog(
          `Résumé generation failed for "${job.title}" — using default résumé: ${error instanceof Error ? error.message : error}`,
          false,
        );
        return null;
      }
    },
    [applierName, pushLog, resumesByJobId],
  );

  /**
   * Drive one job end-to-end: open a fresh tab, wait for load, scan the form,
   * analyze with the AI, generate a tailored résumé, fill, auto-submit, then
   * confirm + mark Applied.
   */
  const applyJob = useCallback(
    async (job: QueuedJob) => {
      if (!canExecute) {
        pushLog(executeDisabledReason ?? "Cannot apply — extension not connected", false);
        return;
      }
      setApplying(true);
      applyingRef.current = true;
      // Start résumé generation immediately so the LLM round-trip overlaps the
      // tab open + scan + analyze rather than blocking before submit.
      const resumePromise = ensureJobResume(job);
      try {
        pushLog(`Applying to "${job.title}"…`, true);
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

        setAnalyzing(true);
        const analysis = await analyzeFormFields({ tree, applicantContext: applicantContext || undefined });
        setAnalyzing(false);
        setActionableTree(tree);
        setTreePage(pageCtx);
        setFormAnalysis(analysis);

        const built = buildFormInjectionPlan({ tree, fields: analysis.fields });
        setInjectionPlan(built.plan);
        setGeneratedScript(built.preview);
        if (!built.plan.steps.length) throw new Error("Plan has no fillable steps");

        // Wait for the tailored résumé (started in parallel above) so the file
        // step uploads the AI-generated PDF; null falls back to the bundled one.
        const resumeFile = (await resumePromise) ?? undefined;

        // Fill everything, then auto-submit (5s countdown handled in the executor).
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
        const submitted = Boolean(applyData?.submitted);
        const firstResults = Array.isArray(applyData?.result) ? applyData!.result : [];

        // Make the résumé-upload outcome explicit — the #1 silent failure.
        const filesFound = applyData?.filesFound ?? 0;
        const filesAttached = applyData?.filesAttached ?? 0;
        if (resumeFile) {
          if (filesFound === 0) {
            pushLog(`⚠ Résumé not uploaded — no file field found on "${job.title}"`, false);
          } else {
            pushLog(`Résumé uploaded to ${filesAttached}/${filesFound} field(s)`, filesAttached > 0);
          }
        }

        // Read the post-submit page and decide success vs needs-retry.
        const pageState = await readApplyPageState(tabId, submitted);
        const outcome = classifyApplyOutcome(pageState);
        if (outcome.applied) {
          pushLog(`"${job.title}" applied — ${outcome.reason}`, true);
          await markJobApplied(job);
        } else {
          // Phase C — hand off to the self-healing retry loop (up to 10×).
          pushLog(`"${job.title}" not confirmed — ${outcome.reason}; starting self-healing`, false);
          await runRecoveryLoop({
            tabId,
            job,
            planSteps: built.plan.steps,
            firstState: pageState,
            firstReason: outcome.reason,
            firstResults,
          });
        }
      } catch (error) {
        pushLog(error instanceof Error ? error.message : "Apply failed", false);
      } finally {
        setAnalyzing(false);
        setApplying(false);
        applyingRef.current = false;
      }
    },
    [applicantContext, canExecute, emitActionAsync, ensureJobResume, executeDisabledReason, markJobApplied, probeComboboxes, pushLog, readApplyPageState, runRecoveryLoop],
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
    setActiveJobIndex,
    appliedJobIds,
    resumesByJobId,
    activeResume: resumeJobId ? resumesByJobId[resumeJobId] ?? null : null,
    applyPhase,
    monitorMode,
    setMonitorMode,
    socketRef,
    connect,
    fetchActionableTree,
    analyzeTree,
    generatePlan,
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
