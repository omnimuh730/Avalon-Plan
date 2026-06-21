import { PageShell } from "../../components/layout/PageShell";
import { useApplier } from "@/context/applier-context";
import { useSkillGraph } from "./hooks/useSkillGraph";
import { useSkillEnrichment } from "./hooks/useSkillEnrichment";
import { KnowledgeGraphView } from "./components/KnowledgeGraphView";

export function KnowledgeGraphPage() {
  const { applier } = useApplier();
  const graph = useSkillGraph();

  const enrichment = useSkillEnrichment(() => {
    void graph.refreshWorldGraph();
  });

  return (
    <PageShell fullWidth className="!overflow-hidden">
      <KnowledgeGraphView
        title="Skill Knowledge Graph"
        description="World skillset from jobs — your resume graphs activate nodes. Analyze pending skills on the Knowledge Graph page (not per job)."
        graph={graph}
        enrichment={enrichment}
        showEnrichment
        showProfileToggle
        applierName={applier?.name}
      />
    </PageShell>
  );
}
