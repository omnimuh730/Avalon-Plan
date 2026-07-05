import React from "react";
import { Download, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Progress } from "../../../components/ui/progress";
import { cn } from "../../../lib/utils";
import type { JobResumeBulkProgress } from "../hooks/useJobResumeGeneration";

type JobBulkActionsBarProps = {
  selectedOnPage: number;
  pageCount: number;
  totalSelected: number;
  allOnPageSelected: boolean;
  onToggleSelectAll: () => void;
  onApplyAll: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onGenerateResumes?: () => void;
  onStopGenerateResumes?: () => void;
  resumeGenerating?: boolean;
  resumeProgress?: JobResumeBulkProgress;
  className?: string;
};

export function JobBulkActionsBar({
  selectedOnPage,
  pageCount,
  totalSelected,
  allOnPageSelected,
  onToggleSelectAll,
  onApplyAll,
  onDownload,
  onRemove,
  onGenerateResumes,
  onStopGenerateResumes,
  resumeGenerating = false,
  resumeProgress,
  className,
}: JobBulkActionsBarProps) {
  const indeterminate = selectedOnPage > 0 && !allOnPageSelected;
  const progressPct =
    resumeProgress && resumeProgress.total > 0
      ? Math.round((resumeProgress.done / resumeProgress.total) * 100)
      : 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-lg border border-border/60 bg-secondary/20 text-sm",
        )}
      >
      <label className="inline-flex items-center gap-2 cursor-pointer select-none shrink-0">
        <input
          type="checkbox"
          checked={allOnPageSelected && pageCount > 0}
          ref={(el) => {
            if (el) el.indeterminate = indeterminate;
          }}
          onChange={onToggleSelectAll}
          className="size-3.5 rounded border-border text-primary focus:ring-primary/30"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Select page ·{" "}
          <span className="text-foreground font-medium">
            {selectedOnPage}/{pageCount}
          </span>
          {totalSelected > selectedOnPage && (
            <span className="ml-1.5 text-primary">({totalSelected} total)</span>
          )}
        </span>
      </label>

      {resumeGenerating && resumeProgress ? (
        <div className="hidden sm:flex flex-1 min-w-[6rem] max-w-xs items-center gap-2 px-1">
          <Progress value={progressPct} className="h-1.5 flex-1" />
          <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
            {progressPct}%
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-1 ml-auto">
        {onGenerateResumes ? (
          resumeGenerating ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 gap-1 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
              onClick={onStopGenerateResumes}
              title="Stop résumé generation immediately"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="tabular-nums whitespace-nowrap">
                {resumeProgress ? (
                  <>
                    <span className="sm:hidden">{resumeProgress.done}/{resumeProgress.total}</span>
                    <span className="hidden sm:inline">
                      Generating résumés {resumeProgress.done}/{resumeProgress.total}
                      {resumeProgress.active > 0
                        ? ` · ${resumeProgress.active} active`
                        : ""}
                      {" · Stop"}
                    </span>
                  </>
                ) : (
                  "Generating résumés… · Stop"
                )}
              </span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 gap-1"
              onClick={onGenerateResumes}
              disabled={totalSelected === 0}
              title="Generate tailored résumés for the selected jobs (max 10 at a time)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="sm:hidden">Generate</span>
              <span className="hidden sm:inline">Generate résumés</span>
            </Button>
          )
        ) : null}
        <Button variant="ghost" size="sm" className="h-8 px-2.5 gap-1" onClick={onApplyAll} disabled={totalSelected === 0}>
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Apply</span>
        </Button>
        <Button variant="ghost" size="sm" className="h-8 px-2.5 gap-1" onClick={onDownload} disabled={totalSelected === 0}>
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          onClick={onRemove}
          disabled={totalSelected === 0}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Remove</span>
        </Button>
      </div>
      </div>

      {resumeGenerating && resumeProgress ? (
        <div className="sm:hidden px-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>
              Generating résumés {resumeProgress.done}/{resumeProgress.total}
              {resumeProgress.active > 0 ? ` · ${resumeProgress.active} active` : ""}
            </span>
            <span className="tabular-nums">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-1" />
        </div>
      ) : null}
    </div>
  );
}
