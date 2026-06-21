import { useMemo, useState } from "react";
import React from "react";
import { Loader2, Sparkles, Square } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { Button } from "../../components/ui/button";
import type { SkillRelationType } from "../../types/knowledgeGraph";
import { useApplier } from "@/context/applier-context";
import { formatEnrichmentCost } from "@/app/api/skillGraph";
import { cn, mono } from "../../lib/utils";
import { useSkillGraph } from "./hooks/useSkillGraph";
import { useSkillEnrichment } from "./hooks/useSkillEnrichment";
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
  const { applier } = useApplier();
  const {
    profiles,
    activeResumeIds,
    toggleResume,
    setAllResumes,
    alpha,
    setAlpha,
    graphData,
    result,
    loading,
    error,
    totalNodes,
    truncated,
    refreshWorldGraph,
    searchNodes,
    worldGraph,
  } = useSkillGraph();

  const {
    session,
    stats,
    pending,
    loading: enrichLoading,
    error: enrichError,
    usage,
    analyze,
    stop,
    isRunning,
  } = useSkillEnrichment(() => {
    void refreshWorldGraph();
  });

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

  const displayStats = useMemo(() => {
    const seeds = graphData.nodes.filter((n) => n.isSeed).length;
    const activated = graphData.nodes.filter((n) => n.activation > 0.15).length;
    return {
      pending: stats.pending,
      universe: worldGraph?.nodes.length ?? 0,
      totalWorld: totalNodes,
      seeds,
      activated,
    };
  }, [graphData.nodes, stats.pending, totalNodes, worldGraph?.nodes.length]);

  const costLabel = formatEnrichmentCost(usage);

  return (
    <PageShell fullWidth className="!overflow-hidden">
      <div className="relative h-full w-full bg-background">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%)",
          }}
        />

        <div className="absolute inset-0 z-0">
          {loading && !worldGraph?.nodes.length ? (
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading world skill graph…
            </div>
          ) : error && !worldGraph?.nodes.length ? (
            <div className="flex items-center justify-center h-full text-destructive text-sm px-8 text-center">
              {error}
            </div>
          ) : (
            <SkillGraphCanvas
              data={graphData}
              selectedId={selectedId}
              onSelect={setSelectedId}
              visibleRelations={visibleRelations}
            />
          )}
        </div>

        <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-4 pointer-events-none">
          <div className="pointer-events-auto">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Skill Knowledge Graph
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
              World skillset from jobs — your resume graphs activate nodes. Analyze pending skills
              on the Knowledge Graph page (not per job).
            </p>
            {truncated ? (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                Showing {displayStats.universe} of {displayStats.totalWorld} world skills.
              </p>
            ) : null}
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2 justify-end">
              <StatChip label="Pending" value={displayStats.pending} />
              <StatChip label="Universe" value={displayStats.universe} />
              <StatChip label="Activated" value={displayStats.activated} />
              <StatChip label="Core" value={displayStats.seeds} />
            </div>
            <div className="flex items-center gap-2">
              {isRunning ? (
                <Button variant="destructive" size="sm" onClick={() => void stop()} disabled={enrichLoading}>
                  <Square className="w-4 h-4" />
                  Stop
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={isRunning || enrichLoading || displayStats.pending === 0}
                onClick={() => void analyze({ applierName: applier?.name, mode: "fast" })}
              >
                {isRunning || enrichLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Analyze pending ({displayStats.pending})
              </Button>
            </div>
            {isRunning && session.processed != null ? (
              <p className={cn("text-[10px] text-muted-foreground", mono)}>
                {session.processed} done · {session.remaining ?? "?"} left
                {costLabel ? ` · AI ${costLabel}` : ""}
              </p>
            ) : costLabel && session.status === "completed" ? (
              <p className={cn("text-[10px] text-muted-foreground", mono)}>AI {costLabel}</p>
            ) : null}
            {enrichError ? <p className="text-xs text-destructive">{enrichError}</p> : null}
          </div>
        </div>

        <div className="absolute top-24 left-4 w-72 max-h-[calc(100%-7rem)] overflow-y-auto subtle-scroll pointer-events-none z-10">
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
            searchNodes={searchNodes}
            pendingSkills={pending}
            matchScoreHint
          />
        </div>

        <SkillInspectorPanel
          node={selectedNode}
          result={result}
          profiles={profiles}
          edges={worldGraph?.edges ?? []}
          nodeLabels={Object.fromEntries(graphData.nodes.map((n) => [n.id, n.label]))}
          nodeCategories={Object.fromEntries(graphData.nodes.map((n) => [n.id, n.category]))}
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
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
