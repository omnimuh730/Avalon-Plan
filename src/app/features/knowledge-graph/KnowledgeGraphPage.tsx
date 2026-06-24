import { PageShell } from "../../components/layout/PageShell";
import { useApplier } from "@/context/applier-context";
import { ResumeSkillListView } from "./components/ResumeSkillListView";

export function KnowledgeGraphPage() {
  const { applier } = useApplier();

  return (
    <PageShell fullWidth className="!overflow-hidden">
      <div className="flex flex-col h-[calc(100vh-5rem)]">
        <header className="px-4 py-3 border-b border-border shrink-0">
          <h1 className="text-lg font-semibold">Resume Skills</h1>
          <p className="text-sm text-muted-foreground">
            Skills extracted from your analyzed resumes (Mongo-backed). Used for Best Match coverage scoring.
          </p>
        </header>
        <ResumeSkillListView applierName={applier?.name} className="flex-1" />
      </div>
    </PageShell>
  );
}
