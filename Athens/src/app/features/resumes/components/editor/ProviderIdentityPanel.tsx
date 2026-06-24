import { RefreshCw } from "lucide-react";
import { AthensInput, AthensSelect, FormField } from "../../../../components/forms";
import type { EditorDraft } from "../../../../types/resume";
import { FALLBACK_MODELS } from "../../lib/generatorDefaults";

type ProviderIdentityPanelProps = {
  draft: EditorDraft;
  models: string[];
  loadingProfile?: boolean;
  onReloadProfile: () => void;
  onIdentityChange: (field: keyof EditorDraft["document"]["identity"], value: string) => void;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onReasoningChange: (effort: string) => void;
};

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "deepseek", label: "DeepSeek" },
];

const REASONING = [
  { value: "default", label: "Default" },
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function ProviderIdentityPanel({
  draft,
  models,
  loadingProfile,
  onReloadProfile,
  onIdentityChange,
  onProviderChange,
  onModelChange,
  onReasoningChange,
}: ProviderIdentityPanelProps) {
  const { identity } = draft.document;
  const modelList = models.length ? models : FALLBACK_MODELS[draft.provider] ?? FALLBACK_MODELS.openai;

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Provider, model & identity</h3>
        <button
          type="button"
          onClick={onReloadProfile}
          disabled={loadingProfile}
          className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingProfile ? "animate-spin" : ""}`} />
          Reload from Settings
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Identity loads from your MongoDB profile (Settings → Profile).</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AthensSelect label="Provider" value={draft.provider} onChange={onProviderChange} options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))} />
        <AthensSelect label="Model" value={draft.model} onChange={onModelChange} options={modelList.map((m) => ({ value: m, label: m }))} />
        <AthensSelect label="Reasoning" value={draft.reasoningEffort} onChange={onReasoningChange} options={REASONING} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Full name">
          <AthensInput value={identity.fullName} onChange={(e) => onIdentityChange("fullName", e.target.value)} />
        </FormField>
        <FormField label="Location">
          <AthensInput value={identity.location} onChange={(e) => onIdentityChange("location", e.target.value)} />
        </FormField>
        <FormField label="Email">
          <AthensInput value={identity.email} onChange={(e) => onIdentityChange("email", e.target.value)} />
        </FormField>
        <FormField label="Phone">
          <AthensInput value={identity.phone} onChange={(e) => onIdentityChange("phone", e.target.value)} />
        </FormField>
        <FormField label="LinkedIn" className="sm:col-span-2">
          <AthensInput value={identity.linkedin} onChange={(e) => onIdentityChange("linkedin", e.target.value)} />
        </FormField>
      </div>
    </div>
  );
}
