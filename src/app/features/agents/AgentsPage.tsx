import React, { useEffect } from "react";
import { PageShell } from "../../components/layout/PageShell";
import { TabTransition } from "../../components/overlays";
import { useAgentsContext } from "../../context/AgentsContext";
import { AgentList } from "./components/AgentList";
import { AgentPipelineMonitor } from "./components/AgentPipelineMonitor";

export function AgentsPage() {
  const { agents, selected, initialMode, setSelectedId, toggle } = useAgentsContext();

  if (selected) {
    return (
      <TabTransition tabKey={selected.id}>
        <AgentPipelineMonitor
          agent={selected}
          initialMode={initialMode}
          onBack={() => setSelectedId(null)}
          onToggle={toggle}
        />
      </TabTransition>
    );
  }

  return (
    <PageShell>
      <TabTransition tabKey="list">
        <AgentList
          agents={agents}
          onSelect={(id) => setSelectedId(id, "monitor")}
          onSelectDesign={(id) => setSelectedId(id, "design")}
          onToggle={toggle}
        />
      </TabTransition>
    </PageShell>
  );
}
