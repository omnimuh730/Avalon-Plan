import { useEffect, useState } from "react";
import { useApplier } from "@/context/applier-context";
import { fetchAgentModels, fetchJobSources, fetchCandidateJobs, fetchChromeProfiles, importChromeSession, type JobCandidate, type ChromeProfile } from "../../../services/agentApi";
import type { DeployOptions, ModelOption, SourceOption } from "../../../types/agent";

export function useDeployForm(onDeploy: (opts: DeployOptions) => Promise<void> | void) {
  const { applier, applierReady } = useApplier();
  const profileId = applier?._id != null ? String(applier._id) : "";

  const [name, setName] = useState("");
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [mode, setMode] = useState<"turbo" | "plan">("plan");
  const [provider, setProvider] = useState<"codex" | "claude-code">("codex");
  const [claudeEngine, setClaudeEngine] = useState<"cli" | "mcp" | "plan">("cli");
  const [autoApprove, setAutoApprove] = useState(true);
  const [generateResumeByAi, setGenerateResumeByAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [source, setSource] = useState("");

  // Transfer list: `fetched` = posted jobs for the current source; `queue` = the
  // jobs the user moved into the worker queue (may span sources). Candidates shown
  // on the left are `fetched` minus whatever is already queued.
  const [fetched, setFetched] = useState<JobCandidate[]>([]);
  const [queue, setQueue] = useState<JobCandidate[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [chromeProfiles, setChromeProfiles] = useState<ChromeProfile[]>([]);
  const [chromeProfile, setChromeProfile] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "done" | "error">("idle");
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    if (!applierReady || !profileId) {
      setModels([]);
      setModel("");
      return;
    }
    setLoadingMeta(true);
    fetchAgentModels(profileId)
      .then((modelList) => {
        setModels(modelList);
        setModel((prev) => (prev && modelList.some((m) => m.id === prev) ? prev : modelList[0]?.id || ""));
      })
      .catch((e) => setErr(String((e as Error)?.message || e)))
      .finally(() => setLoadingMeta(false));
  }, [profileId, applierReady]);

  useEffect(() => {
    if (!profileId) {
      setSources([]);
      setSource("");
      return;
    }
    fetchJobSources(profileId)
      .then((list) => {
        setSources(list);
        setSource((prev) => (prev && list.some((s) => s.title === prev) ? prev : list[0]?.title || ""));
      })
      .catch(() => setSources([]));
  }, [profileId]);

  useEffect(() => {
    fetchChromeProfiles().then(setChromeProfiles).catch(() => setChromeProfiles([]));
  }, []);

  // Load candidate jobs (Best-match rank order, posted only) whenever the source changes.
  const applierName = applier?.name || "";
  useEffect(() => {
    if (!applierName || !source) {
      setFetched([]);
      return;
    }
    setLoadingJobs(true);
    fetchCandidateJobs(applierName, source, 200)
      .then(setFetched)
      .catch(() => setFetched([]))
      .finally(() => setLoadingJobs(false));
  }, [applierName, source]);

  const queuedIds = new Set(queue.map((j) => j.id));
  const candidates = fetched.filter((j) => !queuedIds.has(j.id));

  const addToQueue = (job: JobCandidate) => setQueue((q) => (q.some((x) => x.id === job.id) ? q : [...q, job]));
  const removeFromQueue = (id: string) => setQueue((q) => q.filter((x) => x.id !== id));
  const addAll = () => setQueue((q) => [...q, ...candidates]);
  const clearQueue = () => setQueue([]);

  // Reset import feedback when the picked profile changes.
  useEffect(() => { setImportStatus("idle"); setImportMessage(""); }, [chromeProfile]);

  const importSession = async () => {
    const who = applier?.name || "";
    if (!who || !chromeProfile) return;
    setImportStatus("importing");
    setImportMessage("Importing… make sure Google Chrome is fully quit.");
    try {
      const r = await importChromeSession(who, chromeProfile);
      if (r.success) { setImportStatus("done"); setImportMessage(r.message || "Session imported — agents will reuse it."); }
      else { setImportStatus("error"); setImportMessage(r.error || "Import failed."); }
    } catch (e) {
      setImportStatus("error");
      setImportMessage(String(e instanceof Error ? e.message : e));
    }
  };

  const selectedSource = sources.find((s) => s.title === source);
  const posted = selectedSource?.posted ?? 0;
  const valid = name.trim().length > 0 && !!profileId && !!model && queue.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setErr("Add at least one job to the worker queue (and pick a model).");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      await onDeploy({
        name: name.trim(),
        autoSubmit,
        mode,
        provider,
        claudeEngine,
        autoApprove,
        generateResumeByAi,
        profileId,
        model,
        source,
        startIndex: 0,
        endIndex: queue.length,
        jobIds: queue.map((j) => j.id),
        chromeProfile: chromeProfile || undefined,
      });
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
      setLoading(false);
    }
  }

  return {
    name,
    setName,
    autoSubmit,
    setAutoSubmit,
    mode,
    setMode,
    provider,
    setProvider,
    claudeEngine,
    setClaudeEngine,
    autoApprove,
    setAutoApprove,
    generateResumeByAi,
    setGenerateResumeByAi,
    loading,
    err,
    profileName: applier?.name || "",
    models,
    model,
    setModel,
    loadingMeta,
    sources,
    source,
    setSource,
    posted,
    candidates,
    queue,
    loadingJobs,
    addToQueue,
    removeFromQueue,
    addAll,
    clearQueue,
    chromeProfiles,
    chromeProfile,
    setChromeProfile,
    importSession,
    importStatus,
    importMessage,
    valid,
    handleSubmit,
    applierReady,
  };
}
