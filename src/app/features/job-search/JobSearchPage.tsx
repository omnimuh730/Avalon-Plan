import React, { useEffect, useMemo, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { PaginationBar } from "../../components/shared/PaginationBar";
import { useJobSearchNavigationOptional } from "../../context/JobSearchNavigationContext";
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
import { useJobSelection } from "./hooks/useJobSelection";
import { cn } from "../../lib/utils";

export function JobSearchPage() {
  const jobNav = useJobSearchNavigationOptional();
  const [filters, setFilters] = useState<JobSearchFilterState>(DEFAULT_JOB_FILTERS);
  const [showGrid, setShowGrid] = useState(false);
  const [showScoresOnCards, setShowScoresOnCards] = useState(false);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const { results, statusCounts, total } = useJobSearchResults(filters, removedIds);
  const { selectedIds, selectedJobs, selectJob, selectAllOnPage, clearSelection } =
    useJobSelection(results);

  const { items, page, pageSize, setPage, setPageSize, resetPage } = usePaginatedList({
    items: results,
    pageSize: 25,
  });

  useEffect(() => {
    const pending = jobNav?.pendingFilters;
    if (!pending) return;
    setFilters((prev) => ({ ...prev, ...pending }));
    jobNav.clearPendingFilters();
  }, [jobNav?.pendingFilters, jobNav]);

  useEffect(() => {
    resetPage();
    clearSelection();
  }, [filters, removedIds, resetPage, clearSelection]);

  const pageIds = useMemo(() => items.map((j) => j.id), [items]);
  const selectedOnPage = useMemo(
    () => pageIds.filter((id) => selectedIds.has(id)).length,
    [pageIds, selectedIds],
  );
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  const toggleSelectAllOnPage = () => {
    selectAllOnPage(pageIds, allOnPageSelected);
  };

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
    clearSelection();
  };

  return (
    <PageShell>
      <JobSearchFilterPanel
        filters={filters}
        onChange={setFilters}
        statusCounts={statusCounts}
        showScoresOnCards={showScoresOnCards}
        onShowScoresOnCardsChange={setShowScoresOnCards}
      />

      <JobBulkActionsBar
        selectedOnPage={selectedOnPage}
        pageCount={items.length}
        totalSelected={selectedIds.size}
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
        onSelectJob={selectJob}
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
