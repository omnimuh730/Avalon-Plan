import { X } from "lucide-react";
import type { PipelineNode } from "../../../types";

type AgentNodeInspectorProps = {
  node: PipelineNode;
  onUpdate: (patch: Partial<PipelineNode>) => void;
  onClose: () => void;
};

export function AgentNodeInspector({ node, onUpdate, onClose }: AgentNodeInspectorProps) {
  const config = node.config ?? {};

  return (
    <aside className="w-72 border-l border-border bg-card flex flex-col flex-shrink-0 overflow-y-auto subtle-scroll">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-bold text-foreground">Node inspector</h3>
        <button type="button" onClick={onClose} className="icon-btn text-muted-foreground hover:text-foreground w-8 h-8">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-4">
        <Field label="Label" value={node.label} onChange={(v) => onUpdate({ label: v })} />
        <Field label="Description" value={node.description} onChange={(v) => onUpdate({ description: v })} multiline />
        <Field
          label="Model"
          value={config.model ?? ""}
          onChange={(v) => onUpdate({ config: { ...config, model: v } })}
        />
        <Field
          label="Threshold (0–100)"
          type="number"
          value={String(config.threshold ?? 80)}
          onChange={(v) => onUpdate({ config: { ...config, threshold: Number(v) || 0 } })}
        />
        <Field
          label="Delay (ms)"
          type="number"
          value={String(config.delayMs ?? 100)}
          onChange={(v) => onUpdate({ config: { ...config, delayMs: Number(v) || 0 } })}
        />
        <div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Status</span>
          <select
            value={node.status}
            onChange={(e) => onUpdate({ status: e.target.value as PipelineNode["status"] })}
            className="mt-1.5 w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none"
          >
            {(["draft", "pending", "running", "complete"] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    </aside>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="mt-1.5 w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1.5 w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none min-h-9"
        />
      )}
    </label>
  );
}
