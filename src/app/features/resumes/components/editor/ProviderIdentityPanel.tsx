import { RefreshCw } from "lucide-react";
import { AthensInput, AthensSelect, FormField } from "../../../../components/forms";
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
        <AthensSelect label="Provider" value={draft.provider} onChange={onProviderChange} options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))} />
        <AthensSelect label="Model" value={draft.model} onChange={onModelChange} options={models.map((m) => ({ value: m, label: m }))} />
        <AthensSelect
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
          <FormField key={field} label={label} className={field === "linkedin" ? "sm:col-span-2" : ""}>
            <AthensInput
              value={identity[field]}
              onChange={(e) => onIdentityChange(field, e.target.value)}
            />
          </FormField>
        ))}
      </div>
    </div>
  );
}
