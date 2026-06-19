import { useMemo, useState } from "react";
import React from "react";
import { Sparkles } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import type { SkillRelationType } from "../../types/knowledgeGraph";
import { useSkillGraph } from "./hooks/useSkillGraph";
import { SkillGraphCanvas } from "./components/SkillGraphCanvas";
import { GraphToolbar } from "./components/GraphToolbar";
import { SkillInspectorPanel } from "./components/SkillInspectorPanel";

const ALL_RELATIONS: SkillRelationType[] = [
  "PREREQUISITE_OF",
  "BUILDS_ON",
  "USED_WITH",
  "RELATED_TO",
  "PART_OF",
];

export function KnowledgeGraphPage() {
  const {
    profiles,
    activeResumeIds,
    toggleResume,
    setAllResumes,
    alpha,
    setAlpha,
    graphData,
    result,
  } = useSkillGraph();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibleRelations, setVisibleRelations] = useState<Set<SkillRelationType>>(
    () => new Set(ALL_RELATIONS),
  );

  const toggleRelation = (type: SkillRelationType) =>
    setVisibleRelations((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const selectedNode = useMemo(
    () => graphData.nodes.find((n) => n.id === selectedId) ?? null,
    [graphData.nodes, selectedId],
  );

  const stats = useMemo(() => {
    const seeds = graphData.nodes.filter((n) => n.isSeed).length;
    const activated = graphData.nodes.filter((n) => n.activation > 0.15).length;
    return { seeds, activated, total: graphData.nodes.length };
  }, [graphData.nodes]);

  return (
    <PageShell fullWidth className="!overflow-hidden">
      <div className="relative h-full w-full bg-background">
        {/* Ambient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%)",
          }}
        />

        {/* Graph */}
        <div className="absolute inset-0">
          <SkillGraphCanvas
            data={graphData}
            selectedId={selectedId}
            onSelect={setSelectedId}
            visibleRelations={visibleRelations}
          />
        </div>

        {/* Header */}
        <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-4 pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Skill Knowledge Graph
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              Your resumes light up the universe of skills. Activation spreads through
              related technologies like a neural network.
            </p>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <StatChip label="Core skills" value={stats.seeds} />
            <StatChip label="Activated" value={stats.activated} />
            <StatChip label="Universe" value={stats.total} />
          </div>
        </div>

        {/* Toolbar */}
        <div className="absolute top-24 left-4 w-72 max-h-[calc(100%-7rem)] overflow-y-auto subtle-scroll">
          <GraphToolbar
            profiles={profiles}
            activeResumeIds={activeResumeIds}
            onToggleResume={toggleResume}
            onSetAll={setAllResumes}
            alpha={alpha}
            onAlphaChange={setAlpha}
            visibleRelations={visibleRelations}
            onToggleRelation={toggleRelation}
            onSearchSelect={setSelectedId}
            search={search}
            onSearchChange={setSearch}
          />
        </div>

        <SkillInspectorPanel
          node={selectedNode}
          result={result}
          profiles={profiles}
          onClose={() => setSelectedId(null)}
          onSelectNeighbor={setSelectedId}
        />
      </div>
    </PageShell>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 shadow-sm text-center min-w-16">
      <div className="text-lg font-bold text-foreground leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}
