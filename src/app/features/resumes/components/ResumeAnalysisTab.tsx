import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { useApplier } from "@/context/applier-context";
import { fetchUserResumes } from "../../../services/resumeApi";
import type { UserResumeSummary } from "../../../types/resume";
import { SearchField } from "../../../components/shared/SearchField";
import { Badge } from "../../../components/ui";
import { KnowledgeGraphView } from "../../knowledge-graph/components/KnowledgeGraphView";
import { useResumeAnalysisGraph } from "../../knowledge-graph/hooks/useResumeAnalysisGraph";

type ResumeAnalysisTabProps = {
  onGoToLibrary?: () => void;
};

export function ResumeAnalysisTab({ onGoToLibrary }: ResumeAnalysisTabProps) {
  const { applier, applierReady } = useApplier();
  const [resumes, setResumes] = useState<UserResumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const refresh = useCallback(async () => {
    if (!applier?.name) {
      setResumes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const all = await fetchUserResumes(applier.name);
      const analyzed = all.filter((r) => r.analyzed);
      setResumes(analyzed);
      setSelectedId((prev) => {
        if (prev && analyzed.some((r) => r.id === prev)) return prev;
        return analyzed[0]?.id ?? null;
      });
    } catch {
      setResumes([]);
    } finally {
      setLoading(false);
    }
  }, [applier?.name]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return resumes;
    return resumes.filter(
      (r) =>
        r.fileName.toLowerCase().includes(query) ||
        r.techStack.toLowerCase().includes(query),
    );
  }, [q, resumes]);

  const graph = useResumeAnalysisGraph(selectedId);

  if (!applierReady || loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading analysis…
      </div>
    );
  }

  if (!resumes.length) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center gap-4 px-8">
        <Sparkles className="w-12 h-12 text-primary/50" />
        <div>
          <h3 className="text-lg font-bold text-foreground">No analyzed resumes yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Upload a resume in the Library tab and run Analyze to build a skill knowledge graph with
            strength scores.
          </p>
        </div>
        {onGoToLibrary ? (
          <button
            type="button"
            onClick={onGoToLibrary}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold"
          >
            Go to Library
          </button>
        ) : null}
      </div>
    );
  }

  const selected = resumes.find((r) => r.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[520px] gap-4">
      <aside className="w-64 shrink-0 flex flex-col gap-3">
        <SearchField value={q} onChange={setQ} placeholder="Search analyzed resumes…" />
        <div className="flex-1 overflow-y-auto subtle-scroll space-y-2 pr-1">
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-left rounded-xl border p-3 transition-colors ${
                selectedId === r.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:bg-secondary/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{r.fileName}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.techStack}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {r.skillCount ?? 0} skills
                    </Badge>
                    {r.isPrimary ? (
                      <Badge className="text-[10px] bg-primary/15 text-primary border-0">Primary</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0 rounded-xl border border-border overflow-hidden">
        <KnowledgeGraphView
          title={selected?.fileName ?? "Resume knowledge graph"}
          description="Active vertices show skills from this resume. Strength scores reflect how central each skill is to this profile."
          graph={graph}
          showProfileToggle={false}
          showStrengthPanel
          toolbarClassName="top-20"
          className="min-h-[480px]"
        />
      </div>
    </div>
  );
}
