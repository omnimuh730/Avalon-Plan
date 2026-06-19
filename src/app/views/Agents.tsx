import React, { useState } from "react";
import { PageShell } from "../components/layout/PageShell";
import { AgentList } from "../components/agents/AgentList";
import { AgentPipelineMonitor } from "../components/agents/AgentPipelineMonitor";
import { AGENTS } from "../data/agents";
import type { Agent } from "../types";

export function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = agents.find((a) => a.id === selectedId);

  const toggle = (id: string) =>
    setAgents((p) =>
      p.map((a) =>
        a.id === id ? { ...a, status: a.status === "active" ? "idle" : "active" } : a
      )
    );

  if (selected) {
    return <AgentPipelineMonitor agent={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <PageShell>
      <AgentList agents={agents} onSelect={setSelectedId} onToggle={toggle} />
    </PageShell>
  );
}
