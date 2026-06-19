import React, { useEffect, useCallback, useRef, useState } from "react";
import { Wand2, Loader2 } from "lucide-react";
import { resumeCatalog } from "../../../services/resumeCatalog";
import type { EditorDraft, ResumeTemplateRef } from "../../../types/resume";
import { useResumeEditor } from "../hooks/useResumeEditor";
import { ProviderIdentityPanel } from "./editor/ProviderIdentityPanel";
import { JobDescriptionPanel } from "./editor/JobDescriptionPanel";
import { RefinementPipelinePanel } from "./editor/RefinementPipelinePanel";
import { PreviewToolbar } from "./preview/PreviewToolbar";
import { ResumePreview } from "./preview/ResumePreview";
import { TemplatePickerModal } from "./modals/TemplatePickerModal";
import { ThemeModal } from "./modals/ThemeModal";
import { SectionLayoutModal } from "./modals/SectionLayoutModal";
import { exportPreviewToPdf } from "../lib/exportPdf";
import { exportDocumentToDocx } from "../lib/exportDocx";

type ResumeEditorTabProps = {
  initialJd?: string;
  initialResumeId?: string;
  onGenerated?: () => void;
  onSwitchToHistory?: () => void;
};

export function ResumeEditorTab({
  initialJd,
  initialResumeId,
  onGenerated,
  onSwitchToHistory,
}: ResumeEditorTabProps) {
  const editor = useResumeEditor();
  const previewRef = useRef<HTMLDivElement>(null);
  const [templates, setTemplates] = useState<ResumeTemplateRef[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    resumeCatalog.listTemplates().then(setTemplates);
  }, []);

  useEffect(() => {
    if (initialized || editor.loading) return;
    (async () => {
      if (initialResumeId) await editor.loadFromResume(initialResumeId);
      if (initialJd) editor.updateDraft({ jobDescription: initialJd });
      setInitialized(true);
    })();
  }, [initialized, editor.loading, initialJd, initialResumeId, editor]);

  const draft = editor.draft;
  const activeTemplate = templates.find((t) => t.id === draft?.templateId) ?? templates[0];

  const handleGenerate = async () => {
    const run = await editor.generate();
    onGenerated?.();
    if (run?.status === "completed") onSwitchToHistory?.();
  };

  const handlePdf = useCallback(async () => {
    if (!previewRef.current || !draft) return;
    setExporting(true);
    try {
      await exportPreviewToPdf(previewRef.current, `${draft.document.identity.fullName}-resume.pdf`);
    } finally {
      setExporting(false);
    }
  }, [draft]);

  const handleWord = useCallback(async () => {
    if (!draft) return;
    setExporting(true);
    try {
      await exportDocumentToDocx(draft.document, `${draft.document.identity.fullName}-resume.docx`);
    } finally {
      setExporting(false);
    }
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (editor.draft) void editor.persist(editor.draft);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor.draft, editor.persist]);

  if (editor.loading || !draft || !activeTemplate) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const paperLabel = draft.theme.paperSize === "letter" ? 'Letter — 8.5" × 11"' : "A4";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
        <p className="text-sm text-muted-foreground">
          {editor.generating ? editor.generateStep : "Edit identity & job description, then generate"}
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={editor.generating || !draft.jobDescription.trim()}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 min-h-10"
        >
          {editor.generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          Generate
        </button>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-[55] flex flex-col min-w-0 border-r border-border bg-secondary/30">
          <PreviewToolbar
            paperLabel={paperLabel}
            onTemplate={() => setTemplateOpen(true)}
            onTheme={() => setThemeOpen(true)}
            onLayout={() => setLayoutOpen(true)}
            onPdf={handlePdf}
            onWord={handleWord}
            exporting={exporting}
          />
          <div className="flex-1 overflow-auto p-6 subtle-scroll flex justify-center items-start">
            <div className="origin-top scale-[0.85] sm:scale-90 lg:scale-100">
              <ResumePreview
                ref={previewRef}
                document={draft.document}
                template={activeTemplate}
                theme={draft.theme}
                sections={draft.sections}
              />
            </div>
          </div>
        </div>

        <div className="flex-[45] overflow-y-auto p-4 space-y-4 subtle-scroll">
          <ProviderIdentityPanel
            draft={draft}
            onReloadProfile={editor.reloadProfile}
            onIdentityChange={editor.updateIdentity}
            onProviderChange={(provider) => editor.updateDraft({ provider, model: provider === "openai" ? "gpt-4o-mini" : draft.model })}
            onModelChange={(model) => editor.updateDraft({ model })}
            onReasoningChange={(reasoningEffort) => editor.updateDraft({ reasoningEffort })}
          />
          <JobDescriptionPanel
            value={draft.jobDescription}
            onChange={(jobDescription) => editor.updateDraft({ jobDescription })}
          />
          <RefinementPipelinePanel steps={draft.refinementSteps} onChange={editor.setRefinementSteps} />
        </div>
      </div>

      <TemplatePickerModal
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        templates={templates}
        selectedId={draft.templateId}
        onSelect={(templateId) => editor.updateDraft({ templateId })}
      />
      <ThemeModal
        open={themeOpen}
        onOpenChange={setThemeOpen}
        theme={draft.theme}
        onChange={(theme) => editor.updateDraft({ theme })}
      />
      <SectionLayoutModal
        open={layoutOpen}
        onOpenChange={setLayoutOpen}
        sections={draft.sections}
        onChange={(sections) => editor.updateDraft({ sections })}
      />
    </div>
  );
}
