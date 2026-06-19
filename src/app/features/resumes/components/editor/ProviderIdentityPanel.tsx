import { RefreshCw } from "lucide-react";
import type { EditorDraft } from "../../../../types/resume";

type ProviderIdentityPanelProps = {
  draft: EditorDraft;
  onReloadProfile: () => void;
  onIdentityChange: (field: keyof EditorDraft["document"]["identity"], value: string) => void;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onReasoningChange: (effort: string) => void;
};

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "google", label: "Google" },
];

const MODELS: Record<string, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-nano"],
  anthropic: ["claude-sonnet-4", "claude-haiku-4"],
  google: ["gemini-2-flash", "gemini-pro"],
};

export function ProviderIdentityPanel({
  draft,
  onReloadProfile,
  onIdentityChange,
  onProviderChange,
  onModelChange,
  onReasoningChange,
}: ProviderIdentityPanelProps) {
  const { identity } = draft.document;
  const models = MODELS[draft.provider] ?? MODELS.openai;

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Provider, model & identity</h3>
        <button
          type="button"
          onClick={onReloadProfile}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reload profile
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <SelectField label="Provider" value={draft.provider} onChange={onProviderChange} options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))} />
        <SelectField label="Model" value={draft.model} onChange={onModelChange} options={models.map((m) => ({ value: m, label: m }))} />
        <SelectField
          label="Reasoning effort"
          value={draft.reasoningEffort}
          onChange={onReasoningChange}
          options={[
            { value: "default", label: "Default" },
            { value: "low", label: "Low" },
            { value: "high", label: "High" },
          ]}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(
          [
            ["fullName", "Full Name"],
            ["location", "Location"],
            ["email", "Email"],
            ["phone", "Phone"],
            ["linkedin", "LinkedIn"],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className={field === "linkedin" ? "sm:col-span-2" : ""}>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">{label}</label>
            <input
              value={identity[field]}
              onChange={(e) => onIdentityChange(field, e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 min-h-10"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-secondary border border-border rounded-lg px-2 py-2 text-sm min-h-10"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
