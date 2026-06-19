import React, { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { ListToolbar } from "../../components/shared/ListToolbar";
import { PaginationBar } from "../../components/shared/PaginationBar";
import { Badge, Score } from "../../components/ui";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import {
  useJobSearchFilters,
  JOB_SOURCES,
  JOB_LOCATIONS,
  type JobSortKey,
} from "../../hooks/useJobSearchFilters";
import { JobListView } from "./components/JobListView";
import { cn } from "../../lib/utils";
import type { BadgeVariant } from "../../types";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  saved: "blue",
  applied: "success",
  closed: "subtle",
};

export function JobSearchPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState<JobSortKey>("matchScore");
  const [showGrid, setShowGrid] = useState(false);

  const filtered = useJobSearchFilters(search, status, source, location, sort);
  const { items, total, page, pageSize, setPage, setPageSize } = usePaginatedList({
    items: filtered,
    pageSize: 10,
  });

  return (
    <PageShell>
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search roles, companies..."
        filters={[
          {
            label: "Status",
            value: status,
            options: [
              { value: "all", label: "All status" },
              { value: "saved", label: "Saved" },
              { value: "applied", label: "Applied" },
              { value: "closed", label: "Closed" },
            ],
            onChange: setStatus,
          },
          {
            label: "Source",
            value: source,
            options: JOB_SOURCES.map((s) => ({ value: s, label: s === "all" ? "All sources" : s })),
            onChange: setSource,
          },
          {
            label: "Location",
            value: location,
            options: JOB_LOCATIONS.map((l) => ({ value: l, label: l === "all" ? "All locations" : l })),
            onChange: setLocation,
          },
        ]}
        sort={{
          value: sort,
          options: [
            { value: "matchScore", label: "Best match" },
            { value: "posted", label: "Most recent" },
            { value: "salary", label: "Highest salary" },
            { value: "title", label: "Title A–Z" },
          ],
          onChange: (v) => setSort(v as JobSortKey),
        }}
        pageSize={{
          value: pageSize,
          options: [10, 25, 50],
          onChange: setPageSize,
        }}
        actions={
          <button
            type="button"
            onClick={() => setShowGrid((g) => !g)}
            className={cn(
              "icon-btn border border-border",
              showGrid ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary",
            )}
            title="Toggle grid view"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
        }
      />

      <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      {showGrid ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 py-2">
          {items.map((j) => (
            <div
              key={j.id}
              className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <Score score={j.matchScore} />
                <Badge v={STATUS_VARIANTS[j.status]}>{j.status}</Badge>
              </div>
              <h3 className="text-base font-bold text-foreground mb-1">{j.title}</h3>
              <p className="text-sm text-muted-foreground">{j.company} · {j.location}</p>
              <p className="text-sm font-semibold text-foreground mt-3">{j.salary}</p>
            </div>
          ))}
        </div>
      ) : (
        <JobListView jobs={items} />
      )}

      <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} className="mt-2" />
    </PageShell>
  );
}
