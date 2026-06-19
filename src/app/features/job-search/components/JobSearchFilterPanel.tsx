import React from "react";
import {
  ArrowDownUp,
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Filter,
  Globe,
  Layers,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "../../../components/ui";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import {
  JOB_INDUSTRIES,
  JOB_LOCATIONS,
  JOB_SENIORITIES,
  JOB_SOURCES,
  JOB_WORK_MODES,
} from "../../../data/jobs";
import type { JobSearchFilterState, JobScoreFilters, JobStatusTab, ScoreRange } from "../../../hooks/useJobSearchFilters";
import { countActiveFilters, DEFAULT_SCORE_RANGE } from "../../../hooks/useJobSearchFilters";

const STATUS_TABS: {
  id: JobStatusTab;
  label: string;
  dot: string;
  active: string;
}[] = [
  { id: "all", label: "All", dot: "bg-foreground", active: "bg-foreground text-background" },
  { id: "new", label: "New", dot: "bg-emerald-500", active: "bg-emerald-600 text-white" },
  { id: "applied", label: "Applied", dot: "bg-blue-500", active: "bg-blue-600 text-white" },
  { id: "scheduled", label: "Scheduled", dot: "bg-amber-500", active: "bg-amber-600 text-white" },
  { id: "declined", label: "Declined", dot: "bg-rose-500", active: "bg-rose-600 text-white" },
];

const SCORE_FIELDS: {
  key: keyof JobScoreFilters;
  label: string;
  hint: string;
  accent: string;
}[] = [
  { key: "overall", label: "Overall", hint: "Composite fit", accent: "from-violet-500/10 to-violet-500/5 border-violet-200/60" },
  { key: "skill", label: "Skill", hint: "Role alignment", accent: "from-blue-500/10 to-blue-500/5 border-blue-200/60" },
  { key: "salary", label: "Salary", hint: "Comp match", accent: "from-emerald-500/10 to-emerald-500/5 border-emerald-200/60" },
  { key: "bidEst", label: "Bid est", hint: "Win likelihood", accent: "from-amber-500/10 to-amber-500/5 border-amber-200/60" },
  { key: "freshness", label: "Freshness", hint: "Recency boost", accent: "from-pink-500/10 to-pink-500/5 border-pink-200/60" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "matchScore", label: "Best overall" },
  { value: "skill", label: "Best skill fit" },
  { value: "salary", label: "Highest salary" },
  { value: "freshness", label: "Most fresh" },
  { value: "title", label: "Title A–Z" },
];

type JobSearchFilterPanelProps = {
  filters: JobSearchFilterState;
  onChange: (filters: JobSearchFilterState) => void;
  statusCounts: Record<JobStatusTab, number>;
  filtersVisible: boolean;
  scoresVisible: boolean;
  onToggleFilters: () => void;
  onToggleScores: () => void;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

function FilterInput({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2 bg-background/80 border border-border rounded-xl px-3 py-2 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all min-h-10">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none flex-1 min-w-0"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </label>
  );
}

function FilterSelect({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Icon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-background/80 border border-border rounded-xl pl-9 pr-8 py-2 text-sm text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 min-h-10"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </label>
  );
}

function ScoreRangeField({
  label,
  hint,
  accent,
  range,
  onChange,
}: {
  label: string;
  hint: string;
  accent: string;
  range: ScoreRange;
  onChange: (range: ScoreRange) => void;
}) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));

  return (
    <div className={cn("rounded-xl border bg-gradient-to-br p-3", accent)}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-bold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {range.min}–{range.max}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={100}
          value={range.min}
          onChange={(e) => onChange({ ...range, min: clamp(Number(e.target.value) || 0) })}
          className="w-full bg-background/90 border border-border rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-primary/40"
          aria-label={`${label} minimum`}
        />
        <span className="text-[10px] text-muted-foreground shrink-0">to</span>
        <input
          type="number"
          min={0}
          max={100}
          value={range.max}
          onChange={(e) => onChange({ ...range, max: clamp(Number(e.target.value) || 100) })}
          className="w-full bg-background/90 border border-border rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-primary/40"
          aria-label={`${label} maximum`}
        />
      </div>
    </div>
  );
}

export function JobSearchFilterPanel({
  filters,
  onChange,
  statusCounts,
  filtersVisible,
  scoresVisible,
  onToggleFilters,
  onToggleScores,
}: JobSearchFilterPanelProps) {
  const activeCount = countActiveFilters(filters);

  const patch = (partial: Partial<JobSearchFilterState>) => onChange({ ...filters, ...partial });

  const patchScore = (key: keyof JobScoreFilters, range: ScoreRange) =>
    onChange({ ...filters, scores: { ...filters.scores, [key]: range } });

  const resetScores = () =>
    onChange({
      ...filters,
      scores: {
        overall: { ...DEFAULT_SCORE_RANGE },
        skill: { ...DEFAULT_SCORE_RANGE },
        salary: { ...DEFAULT_SCORE_RANGE },
        bidEst: { ...DEFAULT_SCORE_RANGE },
        freshness: { ...DEFAULT_SCORE_RANGE },
      },
    });

  const clearAll = () =>
    onChange({
      ...filters,
      jobQuery: "",
      companyQuery: "",
      source: "all",
      location: "all",
      workMode: "all",
      seniority: "all",
      industry: "all",
      postedFrom: "",
      postedTo: "",
      scores: {
        overall: { ...DEFAULT_SCORE_RANGE },
        skill: { ...DEFAULT_SCORE_RANGE },
        salary: { ...DEFAULT_SCORE_RANGE },
        bidEst: { ...DEFAULT_SCORE_RANGE },
        freshness: { ...DEFAULT_SCORE_RANGE },
      },
    });

  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 mb-3">
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary via-violet-500 to-emerald-500" />

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS.map((tab) => {
              const active = filters.statusTab === tab.id;
              const count = statusCounts[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => patch({ statusTab: tab.id })}
                  className={cn(
                    "inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-all border",
                    active
                      ? cn(tab.active, "border-transparent shadow-sm")
                      : "bg-secondary/50 text-muted-foreground border-border hover:text-foreground hover:bg-secondary",
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full shrink-0", tab.dot)} />
                  {tab.label}
                  <span className={cn("text-xs font-mono tabular-nums", active ? "opacity-90" : "opacity-70")}>
                    {count.toLocaleString()}
                  </span>
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {activeCount > 0 && (
                <Badge v="violet">
                  {activeCount} filter{activeCount !== 1 ? "s" : ""}
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={onToggleScores} className="gap-1.5">
                {scoresVisible ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {scoresVisible ? "Collapse scores" : "Expand scores"}
              </Button>
              <Button variant="outline" size="sm" onClick={onToggleFilters} className="gap-1.5">
                <SlidersHorizontal className="w-4 h-4" />
                {filtersVisible ? "Hide filters" : "Show filters"}
              </Button>
            </div>
          </div>

          {filtersVisible && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <FilterInput
                  icon={Search}
                  label="Search jobs"
                  value={filters.jobQuery}
                  onChange={(jobQuery) => patch({ jobQuery })}
                  placeholder="e.g. Senior Frontend Engineer…"
                />
                <FilterInput
                  icon={Building2}
                  label="Company"
                  value={filters.companyQuery}
                  onChange={(companyQuery) => patch({ companyQuery })}
                  placeholder="e.g. OpenAI"
                />
                <FilterSelect
                  icon={ArrowDownUp}
                  label="Sort by"
                  value={filters.sort}
                  onChange={(sort) => patch({ sort: sort as JobSearchFilterState["sort"] })}
                  options={SORT_OPTIONS}
                />
                <FilterSelect
                  icon={Globe}
                  label="Source"
                  value={filters.source}
                  onChange={(source) => patch({ source })}
                  options={JOB_SOURCES.map((s) => ({
                    value: s,
                    label: s === "all" ? "All sources" : s,
                  }))}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1fr_1fr] gap-3">
                <label className="flex flex-col gap-1.5">
                  <FieldLabel>Posted between</FieldLabel>
                  <div className="flex items-center gap-2 bg-background/80 border border-border rounded-xl px-3 py-2 min-h-10">
                    <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      type="date"
                      value={filters.postedFrom}
                      onChange={(e) => patch({ postedFrom: e.target.value })}
                      className="bg-transparent text-sm outline-none flex-1 min-w-0"
                      aria-label="Posted from"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <input
                      type="date"
                      value={filters.postedTo}
                      onChange={(e) => patch({ postedTo: e.target.value })}
                      className="bg-transparent text-sm outline-none flex-1 min-w-0"
                      aria-label="Posted to"
                    />
                    {(filters.postedFrom || filters.postedTo) && (
                      <button
                        type="button"
                        onClick={() => patch({ postedFrom: "", postedTo: "" })}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </label>
                <FilterSelect
                  icon={MapPin}
                  label="Location"
                  value={filters.location}
                  onChange={(location) => patch({ location })}
                  options={JOB_LOCATIONS.map((l) => ({
                    value: l,
                    label: l === "all" ? "Any location" : l,
                  }))}
                />
                <FilterSelect
                  icon={Sparkles}
                  label="Work mode"
                  value={filters.workMode}
                  onChange={(workMode) => patch({ workMode })}
                  options={JOB_WORK_MODES.map((m) => ({
                    value: m,
                    label: m === "all" ? "Any mode" : m.charAt(0).toUpperCase() + m.slice(1),
                  }))}
                />
                <FilterSelect
                  icon={Layers}
                  label="Industry"
                  value={filters.industry}
                  onChange={(industry) => patch({ industry })}
                  options={JOB_INDUSTRIES.map((i) => ({
                    value: i,
                    label: i === "all" ? "All industries" : i,
                  }))}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect
                  icon={Filter}
                  label="Seniority"
                  value={filters.seniority}
                  onChange={(seniority) => patch({ seniority })}
                  options={JOB_SENIORITIES.map((s) => ({
                    value: s,
                    label: s === "all" ? "All levels" : s,
                  }))}
                />
                {activeCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAll} className="ml-auto gap-1.5 text-muted-foreground">
                    <X className="w-4 h-4" />
                    Clear all filters
                  </Button>
                )}
              </div>

              {scoresVisible && (
                <div className="space-y-2 pt-1 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-foreground">Score filters (0–100)</p>
                    <Button variant="ghost" size="sm" onClick={resetScores} className="h-7 text-xs">
                      Reset scores
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {SCORE_FIELDS.map((field) => (
                      <ScoreRangeField
                        key={field.key}
                        label={field.label}
                        hint={field.hint}
                        accent={field.accent}
                        range={filters.scores[field.key]}
                        onChange={(range) => patchScore(field.key, range)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
