import React from "react";
import {
  CalendarRange,
  Filter,
  Globe,
  Layers,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Button } from "../../../../components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../../../components/ui/sheet";
import {
  JOB_INDUSTRIES,
  JOB_LOCATIONS,
  JOB_SENIORITIES,
  JOB_SOURCES,
  JOB_WORK_MODES,
} from "../../../../data/jobs";
import type { JobSearchFilterState } from "../../../../hooks/useJobSearchFilters";
import { clearAttributeFilters } from "../../../../hooks/useJobSearchFilters";

type JobFiltersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: JobSearchFilterState;
  onChange: (filters: JobSearchFilterState) => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function CompactSelect({
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
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <Icon className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-secondary/50 border border-border rounded-lg pl-8 pr-7 py-2 text-sm outline-none focus:border-primary/40"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

export function JobFiltersSheet({ open, onOpenChange, filters, onChange }: JobFiltersSheetProps) {
  const patch = (partial: Partial<JobSearchFilterState>) => onChange({ ...filters, ...partial });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Attribute filters</SheetTitle>
          <SheetDescription>Source, location, dates, and role attributes.</SheetDescription>
        </SheetHeader>

        <div className="px-4 space-y-6 pb-4">
          <Section title="Source">
            <CompactSelect
              icon={Globe}
              label="Job source"
              value={filters.source}
              onChange={(source) => patch({ source })}
              options={JOB_SOURCES.map((s) => ({
                value: s,
                label: s === "all" ? "All sources" : s,
              }))}
            />
          </Section>

          <Section title="Posted date">
            <div className="flex items-center gap-2 bg-secondary/50 border border-border rounded-lg px-3 py-2">
              <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="date"
                value={filters.postedFrom}
                onChange={(e) => patch({ postedFrom: e.target.value })}
                className="bg-transparent text-sm outline-none flex-1 min-w-0"
                aria-label="From"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <input
                type="date"
                value={filters.postedTo}
                onChange={(e) => patch({ postedTo: e.target.value })}
                className="bg-transparent text-sm outline-none flex-1 min-w-0"
                aria-label="To"
              />
            </div>
          </Section>

          <Section title="Location & mode">
            <div className="grid grid-cols-1 gap-3">
              <CompactSelect
                icon={MapPin}
                label="Location"
                value={filters.location}
                onChange={(location) => patch({ location })}
                options={JOB_LOCATIONS.map((l) => ({
                  value: l,
                  label: l === "all" ? "Any location" : l,
                }))}
              />
              <CompactSelect
                icon={Sparkles}
                label="Work mode"
                value={filters.workMode}
                onChange={(workMode) => patch({ workMode })}
                options={JOB_WORK_MODES.map((m) => ({
                  value: m,
                  label: m === "all" ? "Any mode" : m.charAt(0).toUpperCase() + m.slice(1),
                }))}
              />
            </div>
          </Section>

          <Section title="Role attributes">
            <div className="grid grid-cols-1 gap-3">
              <CompactSelect
                icon={Filter}
                label="Seniority"
                value={filters.seniority}
                onChange={(seniority) => patch({ seniority })}
                options={JOB_SENIORITIES.map((s) => ({
                  value: s,
                  label: s === "all" ? "All levels" : s,
                }))}
              />
              <CompactSelect
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
          </Section>
        </div>

        <SheetFooter className="flex-row gap-2 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={() => onChange(clearAttributeFilters(filters))}>
            Reset section
          </Button>
          <Button className="flex-1" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
