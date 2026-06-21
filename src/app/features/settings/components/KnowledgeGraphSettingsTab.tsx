import { useApplier } from "@/context/applier-context";
import { useProfileKnowledgeGraph } from "../../knowledge-graph/hooks/useResumeAnalysisGraph";
import { useSkillEnrichment } from "../../knowledge-graph/hooks/useSkillEnrichment";
import { KnowledgeGraphView } from "../../knowledge-graph/components/KnowledgeGraphView";

export function KnowledgeGraphSettingsTab() {
  const { applier } = useApplier();
  const graph = useProfileKnowledgeGraph();

  const enrichment = useSkillEnrichment(() => {
    void graph.refreshWorldGraph();
  });

  return (
    <div className="h-[calc(100vh-14rem)] min-h-[520px] rounded-xl border border-border overflow-hidden">
      <KnowledgeGraphView
        title="Profile knowledge graph"
        description="Aggregated from all analyzed resumes (max strength per skill). React from one resume and Angular from another both appear here after analyze."
        graph={graph}
        enrichment={enrichment}
        showEnrichment
        showProfileToggle={false}
        showStrengthPanel
        resumeSeedFocus
        applierName={applier?.name}
      />
    </div>
  );
}
