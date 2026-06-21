import React, { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Loader2 } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { PaginationBar } from "../../components/shared/PaginationBar";
import { TabTransition } from "../../components/overlays";
import { useJobSearchNavigationOptional } from "../../context/JobSearchNavigationContext";
import {
  DEFAULT_JOB_FILTERS,
  downloadJobsCsv,
  type JobSearchFilterState,
} from "../../hooks/useJobSearchFilters";
import { JobBulkActionsBar } from "./components/JobBulkActionsBar";
import { JobListView } from "./components/JobListView";
import { JobSearchFilterPanel } from "./components/JobSearchFilterPanel";
import { useJobSelection } from "./hooks/useJobSelection";
import { useJobsList, recommendationFallbackMessage } from "./hooks/useJobsList";
import { cn } from "../../lib/utils";

export function JobSearchPage() {
  const jobNav = useJobSearchNavigationOptional();
  const [filters, setFilters] = useState<JobSearchFilterState>(DEFAULT_JOB_FILTERS);
  const [showGrid, setShowGrid] = useState(false);
  const [showScoresOnCards, setShowScoresOnCards] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("athens-job-bookmarks") ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const { jobs, total, loading, refreshing, page, pageSize, setPage, setPageSize, statusCounts, recommendationFallback, recommendationReason } =
    useJobsList(filters, removedIds);
  const { selectedIds, selectedJobs, selectJob, selectAllOnPage, clearSelection } = useJobSelection(jobs);

  useEffect(() => {
    const pending = jobNav?.pendingFilters;
    if (!pending) return;
    setFilters((prev) => ({ ...prev, ...pending }));
    jobNav.clearPendingFilters();
  }, [jobNav?.pendingFilters, jobNav]);

  useEffect(() => {
    clearSelection();
  }, [filters, page, clearSelection]);

  const pageIds = useMemo(() => jobs.map((j) => j.id), [jobs]);
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

  const toggleBookmark = (id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("athens-job-bookmarks", JSON.stringify([...next]));
      return next;
    });
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

      {recommendationFallback && filters.sort === "matchScore" && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-100">
          {recommendationFallbackMessage(recommendationReason)}
        </div>
      )}

      {!recommendationFallback && filters.sort === "matchScore" ? (
        <div className="mb-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
          Best match ranks the most relevant jobs first; remaining jobs follow sorted by date.
        </div>
      ) : null}

      <JobBulkActionsBar
        selectedOnPage={selectedOnPage}
        pageCount={jobs.length}
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

      {loading && jobs.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
          <Loader2 className="w-6 h-6 animate-spin" />
          Loading jobs from server…
        </div>
      ) : (
        <div className={refreshing ? "relative opacity-80 pointer-events-none" : undefined}>
          {refreshing ? (
            <div className="absolute inset-x-0 top-0 z-10 flex justify-center py-2">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          <TabTransition tabKey={showGrid ? "grid" : "list"}>
            <JobListView
              jobs={jobs}
              layout={showGrid ? "grid" : "list"}
              selectedIds={selectedIds}
              onSelectJob={selectJob}
              showScores={showScoresOnCards}
              bookmarkedIds={bookmarkedIds}
              onToggleBookmark={toggleBookmark}
            />
          </TabTransition>
        </div>
      )}

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
