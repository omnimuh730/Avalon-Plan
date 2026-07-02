import React from "react";
import { Download, FileText, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

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
  resumeProgress?: { done: number; total: number };
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

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded-lg border border-border/60 bg-secondary/20 text-sm",
        className,
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

      <div className="flex items-center gap-1 ml-auto">
        {onGenerateResumes ? (
          resumeGenerating ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 gap-1 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
              onClick={onStopGenerateResumes}
              title="Stop after in-flight résumés finish"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">
                {resumeProgress
                  ? `Résumés ${resumeProgress.done}/${resumeProgress.total} · Stop`
                  : "Generating résumés… · Stop"}
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
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Resumes</span>
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
  );
}
