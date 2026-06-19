import React from "react";
import { Download, Send, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

type JobBulkActionsBarProps = {
  pageCount: number;
  totalFiltered: number;
  selectedCount: number;
  allOnPageSelected: boolean;
  onToggleSelectAll: () => void;
  onApplyAll: () => void;
  onDownload: () => void;
  onRemove: () => void;
  className?: string;
};

export function JobBulkActionsBar({
  pageCount,
  totalFiltered,
  selectedCount,
  allOnPageSelected,
  onToggleSelectAll,
  onApplyAll,
  onDownload,
  onRemove,
  className,
}: JobBulkActionsBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 py-2.5 px-4 rounded-xl border border-dashed border-border bg-secondary/20",
        className,
      )}
    >
      <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={allOnPageSelected && pageCount > 0}
          onChange={onToggleSelectAll}
          className="size-4 rounded border-border text-primary focus:ring-primary/30"
        />
        <span className="text-sm font-medium text-foreground">
          Select all on page
          <span className="text-muted-foreground font-normal ml-1.5">
            ({selectedCount} of {totalFiltered.toLocaleString()} in filter)
          </span>
        </span>
      </label>

      <div className="flex items-center gap-2 ml-auto flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={onApplyAll}
          disabled={selectedCount === 0}
          className="gap-1.5"
        >
          <Send className="w-4 h-4" />
          Apply all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={selectedCount === 0}
          className="gap-1.5"
        >
          <Download className="w-4 h-4" />
          Download
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRemove}
          disabled={selectedCount === 0}
          className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
        >
          <Trash2 className="w-4 h-4" />
          Remove
        </Button>
      </div>
    </div>
  );
}
