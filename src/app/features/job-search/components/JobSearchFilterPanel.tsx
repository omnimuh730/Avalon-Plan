import React, { useState } from "react";
import {
  ArrowDownUp,
  Building2,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import {
  countAttributeFilters,
  countScoreFilters,
  getActiveFilterChips,
  type JobSearchFilterState,
  type JobStatusTab,
} from "../../../hooks/useJobSearchFilters";
import { ActiveFilterChips } from "./filters/ActiveFilterChips";
import { JobFiltersSheet } from "./filters/JobFiltersSheet";
import { JobScoreFiltersPopover } from "./filters/JobScoreFiltersPopover";

const STATUS_TABS: {
  id: JobStatusTab;
  label: string;
  dot: string;
}[] = [
  { id: "all", label: "All", dot: "bg-foreground" },
  { id: "new", label: "New", dot: "bg-emerald-500" },
  { id: "applied", label: "Applied", dot: "bg-blue-500" },
  { id: "scheduled", label: "Scheduled", dot: "bg-amber-500" },
  { id: "declined", label: "Declined", dot: "bg-rose-500" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "matchScore", label: "Best match" },
  { value: "skill", label: "Skill fit" },
  { value: "salary", label: "Salary" },
  { value: "freshness", label: "Freshness" },
  { value: "title", label: "Title A–Z" },
];

type JobSearchFilterPanelProps = {
  filters: JobSearchFilterState;
  onChange: (filters: JobSearchFilterState) => void;
  statusCounts: Record<JobStatusTab, number>;
  showScoresOnCards: boolean;
  onShowScoresOnCardsChange: (v: boolean) => void;
};

function CompactInput({
  icon: Icon,
  value,
  onChange,
  placeholder,
  className,
}: {
  icon: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 bg-secondary/60 border border-border rounded-lg px-2.5 h-9 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/10 transition-all min-w-0",
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none flex-1 min-w-0"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function JobSearchFilterPanel({
  filters,
  onChange,
  statusCounts,
  showScoresOnCards,
  onShowScoresOnCardsChange,
}: JobSearchFilterPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(true);

  const patch = (partial: Partial<JobSearchFilterState>) => onChange({ ...filters, ...partial });
  const attributeCount = countAttributeFilters(filters);
  const scoreCount = countScoreFilters(filters);
  const chips = getActiveFilterChips(filters);
  const hasChips = chips.length > 0;

  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 mb-2">
      <div className="rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-sm">
        {/* Layer 1: status tabs */}
        <div className="flex items-center gap-1 px-2 pt-2 pb-1 overflow-x-auto subtle-scroll">
          {STATUS_TABS.map((tab) => {
            const active = filters.statusTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => patch({ statusTab: tab.id })}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors shrink-0",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", tab.dot)} />
                {tab.label}
                <span className="font-mono tabular-nums opacity-80">{statusCounts[tab.id]}</span>
              </button>
            );
          })}
        </div>

        {/* Layer 2: primary controls */}
        <div className="flex items-center gap-2 px-2 py-2 flex-wrap">
          <CompactInput
            icon={Search}
            value={filters.jobQuery}
            onChange={(jobQuery) => patch({ jobQuery })}
            placeholder="Search roles…"
            className="flex-1 min-w-[140px] sm:max-w-[200px]"
          />
          <CompactInput
            icon={Building2}
            value={filters.companyQuery}
            onChange={(companyQuery) => patch({ companyQuery })}
            placeholder="Company…"
            className="flex-1 min-w-[120px] sm:max-w-[160px]"
          />

          <div className="relative shrink-0">
            <ArrowDownUp className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={filters.sort}
              onChange={(e) => patch({ sort: e.target.value as JobSearchFilterState["sort"] })}
              className="appearance-none h-9 pl-8 pr-7 bg-secondary/60 border border-border rounded-lg text-sm outline-none focus:border-primary/40"
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 shrink-0"
            onClick={() => setSheetOpen(true)}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {attributeCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold">
                {attributeCount}
              </span>
            )}
          </Button>

          <JobScoreFiltersPopover
            filters={filters}
            onChange={onChange}
            scoreCount={scoreCount}
            showOnCards={showScoresOnCards}
            onShowOnCardsChange={onShowScoresOnCardsChange}
          />
        </div>

        {/* Layer 3: active filter chips (collapsible) */}
        {hasChips && (
          <div className="border-t border-border/60">
            <button
              type="button"
              onClick={() => setChipsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            >
              <span>
                {chips.length} active filter{chips.length !== 1 ? "s" : ""}
              </span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", chipsOpen && "rotate-180")} />
            </button>
            {chipsOpen && (
              <ActiveFilterChips filters={filters} chips={chips} onChange={onChange} />
            )}
          </div>
        )}
      </div>

      <JobFiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        filters={filters}
        onChange={onChange}
      />
    </div>
  );
}
