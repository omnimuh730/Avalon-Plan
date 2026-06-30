import { useEffect, useState } from "react";
import { useApplier } from "@/context/applier-context";
import { fetchAgentModels, fetchJobSources, fetchCandidateJobs, type JobCandidate } from "../../../services/agentApi";
import type { DeployOptions, ModelOption, SourceOption } from "../../../types/agent";

export function useDeployForm(onDeploy: (opts: DeployOptions) => Promise<void> | void) {
  const { applier, applierReady } = useApplier();
  const profileId = applier?._id != null ? String(applier._id) : "";

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [source, setSource] = useState("");
  const [fetched, setFetched] = useState<JobCandidate[]>([]);
  const [queue, setQueue] = useState<JobCandidate[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

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

  const selectedSource = sources.find((s) => s.title === source);
  const posted = selectedSource?.posted ?? 0;
  const valid = name.trim().length > 0 && !!profileId && queue.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setErr("Add at least one job to the worker queue.");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      await onDeploy({
        name: name.trim(),
        profileId,
        model: model || "avalon",
        source,
        jobIds: queue.map((j) => j.id),
        jobs: queue.map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          url: j.url,
          source: j.source,
        })),
      });
    } catch (e: unknown) {
      setErr(String(e instanceof Error ? e.message : e));
      setLoading(false);
    }
  }

  return {
    name,
    setName,
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
    valid,
    handleSubmit,
    applierReady,
  };
}
