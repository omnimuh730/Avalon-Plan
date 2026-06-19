import React, { useEffect } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { useAgentsContext } from "../../context/AgentsContext";
import { AgentList } from "./components/AgentList";
import { AgentPipelineMonitor } from "./components/AgentPipelineMonitor";

export function AgentsPage() {
  const { agents, selected, initialMode, setSelectedId, toggle } = useAgentsContext();

  if (selected) {
    return (
      <AgentPipelineMonitor
        agent={selected}
        initialMode={initialMode}
        onBack={() => setSelectedId(null)}
        onToggle={toggle}
      />
    );
  }

  return (
    <PageShell>
      <AgentList
        agents={agents}
        onSelect={(id) => setSelectedId(id, "monitor")}
        onSelectDesign={(id) => setSelectedId(id, "design")}
        onToggle={toggle}
      />
    </PageShell>
  );
}
