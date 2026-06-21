import { useRef } from "react";
import { LayoutTemplate, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Badge } from "../../../../components/ui";
import { cn } from "../../../../lib/utils";
import type { ResumeTemplateRef, TemplateLayout } from "../../../../types/resume";
import { TemplatePreviewThumb } from "./TemplatePreviewThumb";
import { uid } from "../../lib/generatorDefaults";

const VALID_LAYOUTS: TemplateLayout[] = [
  "standard", "two-column", "classic", "centered", "minimal", "compact", "modern", "bold",
];

type TemplatePickerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ResumeTemplateRef[];
  selectedId: string;
  onSelect: (id: string) => void;
  onImport?: (template: ResumeTemplateRef) => void | Promise<void>;
};

export function TemplatePickerModal({
  open,
  onOpenChange,
  templates,
  selectedId,
  onSelect,
  onImport,
}: TemplatePickerModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !onImport) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ResumeTemplateRef>;
      if (!parsed.name || !parsed.layout) {
        alert("Template JSON must include name and layout.");
        return;
      }
      if (!VALID_LAYOUTS.includes(parsed.layout)) {
        alert(`Invalid layout. Use one of: ${VALID_LAYOUTS.join(", ")}`);
        return;
      }
      const template: ResumeTemplateRef = {
        id: parsed.id || `uploaded-${uid()}`,
        name: parsed.name,
        layout: parsed.layout,
        description: parsed.description || "Imported template",
        source: "uploaded",
      };
      await onImport(template);
      onSelect(template.id);
      onOpenChange(false);
    } catch {
      alert("Could not parse template JSON file.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-primary" />
            Template
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            The <strong>template</strong> sets the layout. Use <strong>Theme</strong> to restyle it.
          </p>
        </DialogHeader>
        {onImport && (
          <div className="flex justify-end">
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void handleImportFile(e.target.files)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
            >
              <Upload className="w-4 h-4" />
              Import template JSON
            </button>
          </div>
        )}
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
                selectedId === tpl.id ? "border-primary bg-primary/5" : "border-border bg-card",
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
