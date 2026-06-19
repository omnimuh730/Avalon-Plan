import React from "react";
import { PageShell } from "../../components/layout/PageShell";
import { useAgents } from "../../hooks/useAgents";
import { AgentList } from "./components/AgentList";
import { AgentPipelineMonitor } from "./components/AgentPipelineMonitor";

export function AgentsPage() {
  const { agents, selected, setSelectedId, toggle } = useAgents();

  if (selected) {
    return <AgentPipelineMonitor agent={selected} onBack={() => setSelectedId(null)} />;
  }

  return (
    <PageShell>
      <AgentList agents={agents} onSelect={setSelectedId} onToggle={toggle} />
    </PageShell>
  );
}
