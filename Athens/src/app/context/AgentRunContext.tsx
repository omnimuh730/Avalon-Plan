import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ActiveRun, RunSummary } from "../types/agent";

type AgentRunContextValue = {
  activeRun: ActiveRun | null;
  setActiveRun: (run: ActiveRun | null) => void;
  openRun: (run: RunSummary) => void;
  pendingTab: "dashboard" | "runs" | null;
  setPendingTab: (tab: "dashboard" | "runs" | null) => void;
};

const AgentRunContext = createContext<AgentRunContextValue | null>(null);

export function AgentRunProvider({ children }: { children: ReactNode }) {
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [pendingTab, setPendingTab] = useState<"dashboard" | "runs" | null>(null);

  const openRun = useCallback((_run: RunSummary) => {
    setActiveRun(null);
    setPendingTab("runs");
  }, []);

  const value = useMemo(
    () => ({ activeRun, setActiveRun, openRun, pendingTab, setPendingTab }),
    [activeRun, openRun, pendingTab],
  );

  return <AgentRunContext.Provider value={value}>{children}</AgentRunContext.Provider>;
}

export function useAgentRunContext() {
  const ctx = useContext(AgentRunContext);
  if (!ctx) throw new Error("useAgentRunContext must be used within AgentRunProvider");
  return ctx;
}

export function useAgentRunContextOptional() {
  return useContext(AgentRunContext);
}
