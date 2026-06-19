import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { cn } from "../../../../lib/utils";
import type { RefinementStep } from "../../../../types/resume";

type RefinementPipelinePanelProps = {
  steps: RefinementStep[];
  onChange: (steps: RefinementStep[]) => void;
};

export function RefinementPipelinePanel({ steps, onChange }: RefinementPipelinePanelProps) {
  const addStep = () => {
    const step: RefinementStep = {
      id: `step-${Date.now()}`,
      title: `Step ${steps.length + 1}`,
      section: "experience",
      mode: "fine-tune",
      prompt: "",
    };
    onChange([...steps, step]);
  };

  const update = (id: string, patch: Partial<RefinementStep>) => {
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const remove = (id: string) => onChange(steps.filter((s) => s.id !== id));

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
              <input
                value={step.title}
                onChange={(e) => update(step.id, { title: e.target.value })}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-bold"
              />
              <div className="flex gap-1">
                <button type="button" disabled={idx === 0} onClick={() => move(step.id, -1)} className="icon-btn w-8 h-8 disabled:opacity-30">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button type="button" disabled={idx === steps.length - 1} onClick={() => move(step.id, 1)} className="icon-btn w-8 h-8 disabled:opacity-30">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => remove(step.id)} className="icon-btn w-8 h-8 text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-muted-foreground font-semibold">Section</label>
                <select
                  value={step.section}
                  onChange={(e) => update(step.id, { section: e.target.value })}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-2 py-1.5 text-sm"
                >
                  {["experience", "summary", "skills", "education"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-semibold">Mode</label>
                <div className="flex gap-1 mt-1">
                  {(["fine-tune", "final"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => update(step.id, { mode })}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-xs font-bold capitalize border",
                        step.mode === mode ? "bg-primary text-white border-primary" : "bg-background border-border text-muted-foreground"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <textarea
              value={step.prompt}
              onChange={(e) => update(step.id, { prompt: e.target.value })}
              placeholder="Prompt instructions for this step…"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-2"
            />
            {step.mode === "final" && (
              <div>
                <label className="text-xs text-muted-foreground font-semibold">Output schema (JSON)</label>
                <textarea
                  value={step.outputSchema ?? ""}
                  onChange={(e) => update(step.id, { outputSchema: e.target.value })}
                  rows={4}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
