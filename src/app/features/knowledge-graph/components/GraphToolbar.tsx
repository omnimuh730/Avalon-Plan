import { useMemo } from "react";
import { cn } from "../../../lib/utils";
import { SearchField } from "../../../components/shared/SearchField";
import { SKILL_NODES } from "../../../data/knowledge-graph/skillUniverse";
import type { SkillRelationType } from "../../../types/knowledgeGraph";
import { CATEGORY_HUE, CATEGORY_LABEL } from "../lib/graphAdapter";
import type { ProfileOption } from "../hooks/useSkillGraph";

const RELATION_TYPES: { type: SkillRelationType; label: string }[] = [
  { type: "PREREQUISITE_OF", label: "Prerequisite" },
  { type: "BUILDS_ON", label: "Builds on" },
  { type: "USED_WITH", label: "Used with" },
  { type: "RELATED_TO", label: "Related" },
  { type: "PART_OF", label: "Part of" },
];

const CATEGORIES = Array.from(new Set(SKILL_NODES.map((n) => n.category)));

type GraphToolbarProps = {
  profiles: ProfileOption[];
  activeResumeIds: Set<string>;
  onToggleResume: (id: string) => void;
  onSetAll: (active: boolean) => void;
  alpha: number;
  onAlphaChange: (a: number) => void;
  visibleRelations: Set<SkillRelationType>;
  onToggleRelation: (type: SkillRelationType) => void;
  onSearchSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
};

export function GraphToolbar({
  profiles,
  activeResumeIds,
  onToggleResume,
  onSetAll,
  alpha,
  onAlphaChange,
  visibleRelations,
  onToggleRelation,
  onSearchSelect,
  search,
  onSearchChange,
}: GraphToolbarProps) {
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return SKILL_NODES.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 6);
  }, [search]);

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
      {/* Profiles */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Active resumes
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSetAll(true)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              All
            </button>
            <span className="text-muted-foreground text-xs">/</span>
            <button
              type="button"
              onClick={() => onSetAll(false)}
              className="text-xs font-semibold text-muted-foreground hover:underline"
            >
              None
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => {
            const active = activeResumeIds.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggleResume(p.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                  active
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-secondary border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle",
                    active ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Spread (alpha) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Activation spread
          </span>
          <span className="text-xs font-mono text-foreground">{alpha.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0.4}
          max={0.95}
          step={0.01}
          value={alpha}
          onChange={(e) => onAlphaChange(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
          aria-label="Activation spread"
        />
        <p className="text-[11px] text-muted-foreground">
          Higher spread lets activation ripple further from your known skills.
        </p>
      </div>

      {/* Relation filters */}
      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Relations
        </span>
        <div className="flex flex-wrap gap-1.5">
          {RELATION_TYPES.map((r) => {
            const active = visibleRelations.has(r.type);
            return (
              <button
                key={r.type}
                type="button"
                onClick={() => onToggleRelation(r.type)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all",
                  active
                    ? "bg-secondary border-border text-foreground"
                    : "bg-transparent border-border/60 text-muted-foreground/60 line-through",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="space-y-2 relative">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Find skill
        </span>
        <SearchField
          value={search}
          onChange={onSearchChange}
          placeholder="Search skills..."
          className="w-full"
        />
        {matches.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onSearchSelect(m.id);
                  onSearchChange("");
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: `hsl(${CATEGORY_HUE[m.category]}, 70%, 55%)` }}
                />
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category legend */}
      <div className="space-y-2 pt-1 border-t border-border">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Categories
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {CATEGORIES.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: `hsl(${CATEGORY_HUE[c]}, 70%, 55%)` }}
              />
              {CATEGORY_LABEL[c]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
