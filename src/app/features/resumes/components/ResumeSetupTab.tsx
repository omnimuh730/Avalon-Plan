import { useEffect, useState } from "react";
import { Settings2, Sparkles } from "lucide-react";
import { ResumeSettingsPanel } from "./ResumeSettingsPanel";
import { ResumeInsightsPanel } from "./ResumeInsightsPanel";
import { getAiDefaults, saveAiDefaults, type ResumeAiDefaults } from "../../../services/resumeProfileBridge";
import { Pill } from "../../../components/ui";

type SetupSection = "identity" | "stacks" | "pipeline" | "ai" | "insights";

const SECTIONS: { id: SetupSection; label: string }[] = [
  { id: "identity", label: "Identity" },
  { id: "stacks", label: "Stacks" },
  { id: "pipeline", label: "Pipeline" },
  { id: "ai", label: "AI defaults" },
  { id: "insights", label: "Insights" },
];

function AiDefaultsSection() {
  const [ai, setAi] = useState<ResumeAiDefaults>(getAiDefaults);
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveAiDefaults(ai);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="text-base font-bold text-foreground">AI defaults</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        API keys and default models for resume generation in the Editor.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="OpenAI API key" value={ai.openaiKey} type="password" onChange={(v) => setAi({ ...ai, openaiKey: v })} />
        <Field label="OpenAI model" value={ai.openaiModel} onChange={(v) => setAi({ ...ai, openaiModel: v })} />
        <Field label="Deepseek API key" value={ai.deepseekKey} type="password" onChange={(v) => setAi({ ...ai, deepseekKey: v })} />
        <Field label="Default provider" value={ai.defaultProvider} onChange={(v) => setAi({ ...ai, defaultProvider: v })} />
        <Field label="Default model" value={ai.defaultModel} onChange={(v) => setAi({ ...ai, defaultModel: v })} />
      </div>
      <button type="button" onClick={save} className="mt-5 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10">
        Save AI defaults
      </button>
      {saved && <p className="text-sm text-emerald-600 font-semibold mt-2">Saved</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/40 min-h-10"
      />
    </label>
  );
}

export function ResumeSetupTab() {
  const [section, setSection] = useState<SetupSection>("identity");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Resume setup</h2>
          <p className="text-sm text-muted-foreground">Identity, stacks, pipelines, and AI configuration</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 w-fit scroll-row flex-wrap">
        {SECTIONS.map((s) => (
          <Pill key={s.id} active={section === s.id} onClick={() => setSection(s.id)}>
            {s.label}
          </Pill>
        ))}
      </div>

      {section === "insights" && <ResumeInsightsPanel />}
      {section === "ai" && <AiDefaultsSection />}
      {section !== "insights" && section !== "ai" && (
        <ResumeSettingsPanel section={section} />
      )}
    </div>
  );
}
