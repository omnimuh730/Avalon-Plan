import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { PaginationBar } from "../../components/shared/PaginationBar";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import {
  DEFAULT_JOB_FILTERS,
  downloadJobsCsv,
  useJobSearchResults,
  type JobSearchFilterState,
} from "../../hooks/useJobSearchFilters";
import { JobBulkActionsBar } from "./components/JobBulkActionsBar";
import { JobListView } from "./components/JobListView";
import { JobSearchFilterPanel } from "./components/JobSearchFilterPanel";
import { cn } from "../../lib/utils";

export function JobSearchPage() {
  const [filters, setFilters] = useState<JobSearchFilterState>(DEFAULT_JOB_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [scoresVisible, setScoresVisible] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [showScoresOnCards, setShowScoresOnCards] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const { results, statusCounts, total } = useJobSearchResults(filters, removedIds);
  const { items, page, pageSize, setPage, setPageSize, resetPage } = usePaginatedList({
    items: results,
    pageSize: 25,
  });

  useEffect(() => {
    resetPage();
    setSelectedIds(new Set());
  }, [filters, removedIds, resetPage]);

  const pageIds = useMemo(() => items.map((j) => j.id), [items]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const selectedJobs = useMemo(
    () => results.filter((j) => selectedIds.has(j.id)),
    [results, selectedIds],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [allOnPageSelected, pageIds]);

  const handleApplyAll = () => {
    selectedJobs.forEach((job) => window.open(job.applyUrl, "_blank", "noopener,noreferrer"));
  };

  const handleDownload = () => {
    downloadJobsCsv(selectedJobs, `jobs-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleRemove = () => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
  };

  return (
    <PageShell>
      <JobSearchFilterPanel
        filters={filters}
        onChange={setFilters}
        statusCounts={statusCounts}
        filtersVisible={filtersVisible}
        scoresVisible={scoresVisible}
        onToggleFilters={() => setFiltersVisible((v) => !v)}
        onToggleScores={() => {
          setScoresVisible((v) => {
            const next = !v;
            setShowScoresOnCards(next);
            return next;
          });
        }}
      />

      <JobBulkActionsBar
        pageCount={items.length}
        totalFiltered={total}
        selectedCount={selectedIds.size}
        allOnPageSelected={allOnPageSelected}
        onToggleSelectAll={toggleSelectAllOnPage}
        onApplyAll={handleApplyAll}
        onDownload={handleDownload}
        onRemove={handleRemove}
        className="mb-3"
      />

      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          detailed
        />
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
      </div>

      <JobListView
        jobs={items}
        layout={showGrid ? "grid" : "list"}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        showScores={showScoresOnCards}
      />

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        detailed
        className="mt-2"
      />
    </PageShell>
  );
}
