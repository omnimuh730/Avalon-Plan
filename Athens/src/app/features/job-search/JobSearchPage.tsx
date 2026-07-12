import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { removeJobs } from "../../api/jobs";
import { PageShell } from "../../components/layout/PageShell";
import { PaginationBar } from "../../components/shared/PaginationBar";
import { TabTransition } from "../../components/overlays";
import { useJobSearchNavigationOptional } from "../../context/JobSearchNavigationContext";
import {
  DEFAULT_JOB_FILTERS,
  downloadJobsCsv,
  type JobSearchFilterState,
} from "../../hooks/useJobSearchFilters";
import { JobExportDialog } from "./components/JobExportDialog";
import { JobListStickyBar } from "./components/JobListStickyBar";
import { JobListView } from "./components/JobListView";
import { JobSearchFilterPanel } from "./components/JobSearchFilterPanel";
import { useJobSelection } from "./hooks/useJobSelection";
import { useJobApplicationActions } from "./hooks/useJobApplicationActions";
import { useJobResumeGeneration } from "./hooks/useJobResumeGeneration";
import { useJobsList, recommendationFallbackMessage } from "./hooks/useJobsList";
import { isExternalJob } from "../../types/job";

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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const { jobs, total, loading, refreshing, page, pageSize, setPage, setPageSize, statusCounts, recommendationFallback, recommendationReason, recommendationWarming, patchJob, refreshStatusCounts } =
    useJobsList(filters, removedIds);
  const { selectedIds, selectedJobs, selectJob, selectAllOnPage, clearSelection } = useJobSelection(jobs);
  const { applyToJob, updateJobStatus, cancelJobStatus, isPending } = useJobApplicationActions(patchJob, refreshStatusCounts);
  const { resumeStates, generateForJob, generateBulk, cancelBulk, bulkRunning, bulkProgress } =
    useJobResumeGeneration(jobs);

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

  const handleApplyAll = async (jobs = selectedJobs) => {
    const marketJobs = jobs.filter((job) => !isExternalJob(job));
    if (!marketJobs.length) {
      toast.message("External scraped jobs open in a new tab only — nothing to mark as applied.");
      return;
    }
    await Promise.all(marketJobs.map((job) => applyToJob(job, { openUrl: false })));
  };

  const downloadSelected = () => {
    downloadJobsCsv(selectedJobs, `jobs-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleExportWithApply = async () => {
    setExportBusy(true);
    try {
      await handleApplyAll();
      downloadSelected();
      setExportOpen(false);
    } finally {
      setExportBusy(false);
    }
  };

  const handleExportOnly = () => {
    downloadSelected();
    setExportOpen(false);
  };

  const handleRemove = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    // Optimistically hide, then permanently delete from the DB.
    setRemovedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    clearSelection();
    try {
      const res = await removeJobs(ids);
      if (!res?.success) throw new Error(res?.error || "Remove failed");
      toast.success(`Removed ${res.deletedCount ?? ids.length} job${ids.length === 1 ? "" : "s"}`);
      void refreshStatusCounts();
    } catch (err) {
      // Revert the optimistic hide so nothing silently disappears.
      setRemovedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Failed to remove jobs");
    }
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

  const matchScoreHint =
    filters.sort === "matchScore"
      ? recommendationFallback
        ? recommendationFallbackMessage(recommendationReason)
        : recommendationWarming
          ? "Match scores are being recalculated for your profile — ranking will sharpen shortly."
          : "Best match ranks the most relevant jobs first; remaining jobs follow sorted by date."
      : null;

  const matchScoreHintVariant =
    filters.sort === "matchScore" && recommendationFallback ? "warning" : "info";

  return (
    <PageShell>
      <JobSearchFilterPanel
        filters={filters}
        onChange={setFilters}
        statusCounts={statusCounts}
        showScoresOnCards={showScoresOnCards}
        onShowScoresOnCardsChange={setShowScoresOnCards}
        matchScoreHint={matchScoreHint}
        matchScoreHintVariant={matchScoreHintVariant}
      />

      <JobListStickyBar
        selectedOnPage={selectedOnPage}
        pageCount={jobs.length}
        totalSelected={selectedIds.size}
        allOnPageSelected={allOnPageSelected}
        onToggleSelectAll={toggleSelectAllOnPage}
        onExport={() => setExportOpen(true)}
        onRemove={handleRemove}
        onGenerateResumes={() => {
          void generateBulk(selectedJobs);
        }}
        onStopGenerateResumes={cancelBulk}
        resumeGenerating={bulkRunning}
        resumeProgress={bulkProgress ?? undefined}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((g) => !g)}
      />

      <JobExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        count={selectedIds.size}
        onExportWithApply={() => void handleExportWithApply()}
        onExportOnly={handleExportOnly}
        busy={exportBusy}
      />

      {loading && jobs.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
          <Loader2 className="w-6 h-6 animate-spin" />
          Loading jobs from server…
        </div>
      ) : (
        <div className={refreshing ? "relative" : undefined}>
          {refreshing ? (
            <div className="absolute inset-x-0 top-0 z-10 flex justify-center py-2 pointer-events-none">
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
              isJobPending={isPending}
              onApply={(job) => void applyToJob(job)}
              onMarkScheduled={(job) => void updateJobStatus(job, "scheduled")}
              onMarkDeclined={(job) => void updateJobStatus(job, "declined")}
              onCancel={(job) => void cancelJobStatus(job)}
              onJobScoresUpdated={patchJob}
              resumeStates={resumeStates}
              onGenerateResume={(job) => {
                void generateForJob(job);
              }}
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
