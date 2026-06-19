import { useState } from "react";
import { AGENTS } from "../data/agents";
import type { Agent } from "../types";

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  const toggle = (id: string) =>
    setAgents((p) =>
      p.map((a) =>
        a.id === id ? { ...a, status: a.status === "active" ? "idle" : "active" } : a
      )
    );

  return { agents, selected, selectedId, setSelectedId, toggle };
}
