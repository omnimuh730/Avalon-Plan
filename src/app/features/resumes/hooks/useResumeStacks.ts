import { useCallback, useEffect, useMemo, useState } from "react";
import { getStackCatalog, saveStackCatalog } from "../../../services/resumeStorage";
import type { ResumeStackCatalog } from "../../../types/resume";
import { computeStackStats, stackAvgScore, validateStackCatalog } from "../lib/validateStacks";

export function useResumeStacks() {
  const [catalog, setCatalog] = useState<ResumeStackCatalog>({});
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [valid, setValid] = useState(true);
  const [featuredStack, setFeaturedStack] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getStackCatalog();
    setCatalog(data);
    setJsonText(JSON.stringify(data, null, 2));
    const stacks = Object.keys(data);
    setFeaturedStack(stacks[0] ?? null);
    setValid(true);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const validate = useCallback(() => {
    const result = validateStackCatalog(jsonText);
    setValid(result.valid);
    setError(result.error ?? null);
    if (result.valid && result.catalog) {
      setCatalog(result.catalog);
      const stacks = Object.keys(result.catalog);
      if (!featuredStack || !result.catalog[featuredStack]) {
        setFeaturedStack(stacks[0] ?? null);
      }
    }
    return result;
  }, [jsonText, featuredStack]);

  const save = useCallback(async () => {
    const result = validate();
    if (!result.valid || !result.catalog) return false;
    await saveStackCatalog(result.catalog);
    setCatalog(result.catalog);
    return true;
  }, [validate]);

  const stats = useMemo(() => computeStackStats(catalog), [catalog]);
  const stackNames = useMemo(() => Object.keys(catalog), [catalog]);

  const stackCards = useMemo(
    () =>
      stackNames.map((name) => ({
        name,
        skillCount: Object.keys(catalog[name]).length,
        avg: stackAvgScore(name, catalog),
      })),
    [stackNames, catalog]
  );

  return {
    catalog,
    jsonText,
    setJsonText,
    error,
    valid,
    featuredStack,
    setFeaturedStack,
    loading,
    stats,
    stackNames,
    stackCards,
    validate,
    save,
    reload: load,
  };
}
