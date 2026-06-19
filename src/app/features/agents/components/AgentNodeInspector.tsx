import { AthensInput, AthensSelect, AthensTextarea, FormField } from "../../../components/forms";
import { SlidePanel, SlidePanelHeader } from "../../../components/overlays";
import type { PipelineNode } from "../../../types";

type AgentNodeInspectorProps = {
  node: PipelineNode | null;
  onUpdate: (patch: Partial<PipelineNode>) => void;
  onClose: () => void;
};

export function AgentNodeInspector({ node, onUpdate, onClose }: AgentNodeInspectorProps) {
  const config = node?.config ?? {};

  return (
    <SlidePanel open={!!node} onOpenChange={(open) => !open && onClose()} width="sm">
      {node && (
        <>
          <SlidePanelHeader title="Node inspector" onClose={onClose} />
          <div className="p-4 space-y-4 overflow-y-auto subtle-scroll flex-1">
            <FormField label="Label">
              <AthensInput value={node.label} onChange={(e) => onUpdate({ label: e.target.value })} />
            </FormField>
            <FormField label="Description">
              <AthensTextarea value={node.description} onChange={(e) => onUpdate({ description: e.target.value })} rows={3} />
            </FormField>
            <FormField label="Model">
              <AthensInput value={config.model ?? ""} onChange={(e) => onUpdate({ config: { ...config, model: e.target.value } })} />
            </FormField>
            <FormField label="Threshold (0–100)">
              <AthensInput
                type="number"
                value={String(config.threshold ?? 80)}
                onChange={(e) => onUpdate({ config: { ...config, threshold: Number(e.target.value) || 0 } })}
              />
            </FormField>
            <FormField label="Delay (ms)">
              <AthensInput
                type="number"
                value={String(config.delayMs ?? 100)}
                onChange={(e) => onUpdate({ config: { ...config, delayMs: Number(e.target.value) || 0 } })}
              />
            </FormField>
            <AthensSelect
              label="Status"
              value={node.status}
              onChange={(status) => onUpdate({ status: status as PipelineNode["status"] })}
              options={(["draft", "pending", "running", "complete"] as const).map((s) => ({ value: s, label: s }))}
            />
          </div>
        </>
      )}
    </SlidePanel>
  );
}
