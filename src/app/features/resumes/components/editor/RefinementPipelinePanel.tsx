import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { AthensInput, AthensSelect, AthensTextarea, FormField } from "../../../../components/forms";
import { cn } from "../../../../lib/utils";
import type { RefinementStep, StepKind, StepPurpose } from "../../../../types/resume";
import { defaultPromptFor, defaultSchemaFor, uid } from "../../lib/generatorDefaults";

type RefinementPipelinePanelProps = {
  steps: RefinementStep[];
  onChange: (steps: RefinementStep[]) => void;
};

const PURPOSE_OPTIONS: { value: StepPurpose; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "skills", label: "Skills" },
  { value: "experience", label: "Experience" },
];

export function RefinementPipelinePanel({ steps, onChange }: RefinementPipelinePanelProps) {
  const addStep = () => {
    const step: RefinementStep = {
      id: uid(),
      purpose: "experience",
      kind: "fine-tune",
      name: `Step ${steps.length + 1}`,
      prompt: defaultPromptFor("experience", "fine-tune"),
    };
    onChange([...steps, step]);
  };

  const update = (id: string, patch: Partial<RefinementStep>) => {
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const remove = (id: string) => {
    const target = steps.find((s) => s.id === id);
    if (target?.kind === "final") return;
    onChange(steps.filter((s) => s.id !== id));
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = steps.findIndex((s) => s.id === id);
    const next = idx + dir;
    if (next < 0 || next >= steps.length) return;
    const copy = [...steps];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground">AI refinement pipeline</h3>
        <button type="button" onClick={addStep} className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
          <Plus className="w-3.5 h-3.5" />
          Add step
        </button>
      </div>
      <div className="space-y-4">
        {steps.map((step, idx) => (
          <div key={step.id} className="border border-border rounded-xl p-4 bg-secondary/30">
            <div className="flex items-start gap-2 mb-3">
              <AthensInput
                value={step.name}
                onChange={(e) => update(step.id, { name: e.target.value })}
                className="flex-1 font-bold"
              />
              <div className="flex gap-1">
                <button type="button" disabled={idx === 0} onClick={() => move(step.id, -1)} className="icon-btn w-8 h-8 disabled:opacity-30">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button type="button" disabled={idx === steps.length - 1} onClick={() => move(step.id, 1)} className="icon-btn w-8 h-8 disabled:opacity-30">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => remove(step.id)} disabled={step.kind === "final"} className="icon-btn w-8 h-8 text-destructive disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <AthensSelect
                label="Purpose"
                value={step.purpose}
                onChange={(purpose) => {
                  const p = purpose as StepPurpose;
                  update(step.id, {
                    purpose: p,
                    prompt: defaultPromptFor(p, step.kind),
                    schema: step.kind === "final" ? defaultSchemaFor(p) : undefined,
                  });
                }}
                options={PURPOSE_OPTIONS}
              />
              <div>
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Kind</span>
                <div className="flex gap-1 mt-1.5">
                  {(["fine-tune", "final"] as StepKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() =>
                        update(step.id, {
                          kind,
                          prompt: defaultPromptFor(step.purpose, kind),
                          schema: kind === "final" ? defaultSchemaFor(step.purpose) : undefined,
                        })
                      }
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-xs font-bold capitalize border",
                        step.kind === kind ? "bg-primary text-white border-primary" : "bg-background border-border text-muted-foreground",
                      )}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <AthensTextarea
              value={step.prompt}
              onChange={(e) => update(step.id, { prompt: e.target.value })}
              placeholder="Prompt instructions for this step…"
              rows={3}
              className="mb-2"
            />
            {step.kind === "final" && (
              <FormField label="Output schema (JSON)">
                <AthensTextarea
                  value={step.schema ?? ""}
                  onChange={(e) => update(step.id, { schema: e.target.value })}
                  rows={4}
                  className="font-mono text-xs"
                />
              </FormField>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
