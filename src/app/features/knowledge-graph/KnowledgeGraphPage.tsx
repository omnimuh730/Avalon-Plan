import { PageShell } from "../../components/layout/PageShell";
import { useApplier } from "@/context/applier-context";
import { useSkillEnrichment } from "./hooks/useSkillEnrichment";
import { SkillCatalogView } from "./components/SkillCatalogView";

export function KnowledgeGraphPage() {
  const { applier } = useApplier();

  const enrichment = useSkillEnrichment();

  return (
    <PageShell fullWidth className="!overflow-hidden">
      <SkillCatalogView
        title="Skill Knowledge Graph"
        description="Browse world skills from jobs and resumes. Search, select skills, and use Enhance relations to generate new connections with AI."
        applierName={applier?.name}
        enrichment={enrichment}
        showEnrichment
        className="h-[calc(100vh-5rem)]"
      />
    </PageShell>
  );
}
