import { useEffect } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { useApplier } from "@/context/applier-context";
import { GenerationHistory } from "./history/generation-history";
import { applyHistoryRun } from "./hooks/load-history-run";
import { useGeneratorPage } from "./hooks/use-generator-page";
import { GeneratorEditorView } from "./views/generator-editor-view";
import { printCss } from "./preview/utils";
import type { FullRun } from "./history/history-types";

type ResumeGeneratorPanelProps = {
  /** When set, forces editor or history view (Athens top-level tabs). */
  activeView?: "editor" | "history";
  initialJd?: string;
  /** Load a history run into the editor (from Library / History). */
  pendingRun?: FullRun | null;
  onPendingRunConsumed?: () => void;
  onGenerated?: () => void;
};

export function ResumeGeneratorPanel({
  activeView,
  initialJd,
  pendingRun,
  onPendingRunConsumed,
  onGenerated,
}: ResumeGeneratorPanelProps) {
  const vm = useGeneratorPage();
  const { applier, theme, view, setView, generating, validation, handleGenerate, setConfig, setGenerated, setUsage } = vm;

  const effectiveView = activeView ?? view;

  useEffect(() => {
    if (activeView) setView(activeView);
  }, [activeView, setView]);

  useEffect(() => {
    if (!initialJd?.trim()) return;
    setConfig((c) => ({ ...c, jobDescription: initialJd }));
  }, [initialJd, setConfig]);

  useEffect(() => {
    if (!pendingRun) return;
    applyHistoryRun(pendingRun, setConfig, setGenerated, setUsage, activeView ? undefined : setView);
    onPendingRunConsumed?.();
  }, [pendingRun, setConfig, setGenerated, setUsage, setView, activeView, onPendingRunConsumed]);

  const onGenerate = async () => {
    await handleGenerate();
    onGenerated?.();
  };

  return (
    <div className="min-h-0">
      <style>{printCss(theme.paper)}</style>

      {effectiveView === "editor" && (
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={generating || validation.length > 0 || !applier?.name}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 min-h-10"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
      )}

      {effectiveView === "history" ? (
        <GenerationHistory
          applierName={applier?.name ?? null}
          onLoad={(run) => applyHistoryRun(run, setConfig, setGenerated, setUsage, setView)}
        />
      ) : (
        <GeneratorEditorView vm={vm} />
      )}
    </div>
  );
}

export { useGeneratorPage } from "./hooks/use-generator-page";
export type { FullRun } from "./history/history-types";
export { applyHistoryRun } from "./hooks/load-history-run";
