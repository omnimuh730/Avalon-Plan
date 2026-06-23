import { useEffect, useState } from "react";
import { useApplier } from "@/context/applier-context";
import { fetchAgentModels, fetchJobSources } from "../../../services/agentApi";
import type { DeployOptions, ModelOption, SourceOption } from "../../../types/agent";

export function useDeployForm(onDeploy: (opts: DeployOptions) => Promise<void> | void) {
  const { applier, applierReady } = useApplier();
  const profileId = applier?._id != null ? String(applier._id) : "";

  const [name, setName] = useState("");
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [mode, setMode] = useState<"turbo" | "plan">("plan");
  const [provider, setProvider] = useState<"codex" | "claude-code">("codex");
  const [claudeEngine, setClaudeEngine] = useState<"cli" | "mcp">("cli");
  const [autoApprove, setAutoApprove] = useState(true);
  const [generateResumeByAi, setGenerateResumeByAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [source, setSource] = useState("");
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(3);

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

  const selectedSource = sources.find((s) => s.title === source);
  const posted = selectedSource?.posted ?? 0;
  const rangeCount = Math.max(0, Math.min(endIndex, posted) - startIndex);
  const valid =
    name.trim().length > 0 &&
    !!profileId &&
    !!model &&
    !!source &&
    startIndex >= 0 &&
    endIndex > startIndex &&
    rangeCount > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setErr("Pick a model, job source, and a valid range.");
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
        startIndex,
        endIndex: Math.min(endIndex, posted),
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
    startIndex,
    setStartIndex,
    endIndex,
    setEndIndex,
    posted,
    rangeCount,
    valid,
    handleSubmit,
    applierReady,
  };
}
