import { useCallback, useEffect, useState } from "react";
import { fetchAvalonHealth } from "../../../services/agentApi";
import type { AvalonHealthData } from "../../../types/agent";

export function useAvalonHealth() {
  const [health, setHealth] = useState<AvalonHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await fetchAvalonHealth());
    } catch {
      setHealth({ ok: false, extension: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { health, loading, refresh };
}
