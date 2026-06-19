import { LayoutTemplate } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Badge } from "../../../../components/ui";
import { cn } from "../../../../lib/utils";
import type { ResumeTemplateRef } from "../../../../types/resume";
import { TemplatePreviewThumb } from "./TemplatePreviewThumb";

type TemplatePickerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ResumeTemplateRef[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function TemplatePickerModal({
  open,
  onOpenChange,
  templates,
  selectedId,
  onSelect,
}: TemplatePickerModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-primary" />
            Template
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            The <strong>template</strong> sets the layout (columns, header & heading alignment). Use <strong>Theme</strong> to restyle it.
          </p>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                onSelect(tpl.id);
                onOpenChange(false);
              }}
              className={cn(
                "text-left rounded-xl p-3 border transition-all hover:shadow-md",
                selectedId === tpl.id ? "border-primary bg-primary/5" : "border-border bg-card"
              )}
            >
              <TemplatePreviewThumb layout={tpl.layout} selected={selectedId === tpl.id} />
              <div className="mt-2 flex items-center gap-2">
                <p className="text-sm font-bold text-foreground">{tpl.name}</p>
                {tpl.source === "uploaded" && <Badge v="blue">Uploaded</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
