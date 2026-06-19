import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AGENTS } from "../data/agents";
import type { Agent, AgentStudioMode } from "../types";

type AgentsContextValue = {
  agents: Agent[];
  selectedId: string | null;
  selected: Agent | null;
  initialMode: AgentStudioMode;
  setSelectedId: (id: string | null, mode?: AgentStudioMode) => void;
  toggle: (id: string) => void;
  pauseAll: () => void;
};

const AgentsContext = createContext<AgentsContextValue | null>(null);

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [initialMode, setInitialMode] = useState<AgentStudioMode>("monitor");

  const setSelectedId = useCallback((id: string | null, mode: AgentStudioMode = "monitor") => {
    setSelectedIdState(id);
    setInitialMode(mode);
  }, []);

  const selected = useMemo(() => agents.find((a) => a.id === selectedId) ?? null, [agents, selectedId]);

  const toggle = useCallback((id: string) => {
    setAgents((p) =>
      p.map((a) => (a.id === id ? { ...a, status: a.status === "active" ? "idle" : "active" } : a)),
    );
  }, []);

  const pauseAll = useCallback(() => {
    setAgents((p) => p.map((a) => (a.status === "active" ? { ...a, status: "idle" } : a)));
  }, []);

  const value = useMemo(
    () => ({ agents, selectedId, selected, initialMode, setSelectedId, toggle, pauseAll }),
    [agents, selectedId, selected, initialMode, setSelectedId, toggle, pauseAll],
  );

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgentsContext() {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgentsContext must be used within AgentsProvider");
  return ctx;
}

export function useAgentsContextOptional() {
  return useContext(AgentsContext);
}
