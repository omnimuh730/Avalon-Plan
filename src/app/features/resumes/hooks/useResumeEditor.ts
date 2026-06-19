import { useCallback, useEffect, useState } from "react";
import { createDefaultEditorDraft, createDefaultEditorDraftFromSummary } from "../../../data/resumes/seedDocument";
import { resumeAiMock, estimateRefinementUsage } from "../../../services/resumeAiMock";
import { resumeCatalog } from "../../../services/resumeCatalog";
import {
  getEditorDraft,
  getIdentityProfile,
  saveEditorDraft,
  saveGenerationRun,
} from "../../../services/resumeStorage";
import type { EditorDraft, GenerationRun, RefinementStep } from "../../../types/resume";

export function useResumeEditor() {
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateStep, setGenerateStep] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getEditorDraft();
      const profile = await getIdentityProfile();
      if (!cancelled) {
        setDraft({
          ...stored,
          document: { ...stored.document, identity: { ...profile } },
        });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (next: EditorDraft) => {
    setDraft(next);
    await saveEditorDraft(next);
  }, []);

  const updateDraft = useCallback(
    (patch: Partial<EditorDraft>) => {
      if (!draft) return;
      void persist({ ...draft, ...patch });
    },
    [draft, persist]
  );

  const reloadProfile = useCallback(async () => {
    const profile = await getIdentityProfile();
    if (!draft) return;
    void persist({
      ...draft,
      document: { ...draft.document, identity: { ...profile } },
    });
  }, [draft, persist]);

  const loadFromResume = useCallback(async (resumeId: string) => {
    const record = await resumeCatalog.getDocument(resumeId);
    const summaries = await resumeCatalog.listResumes();
    const summary = summaries.find((s) => s.id === resumeId);
    if (summary && record) {
      const next = createDefaultEditorDraftFromSummary(summary, record);
      await persist(next);
      return next;
    }
    return null;
  }, [persist]);

  const resetDraft = useCallback(async () => {
    const profile = await getIdentityProfile();
    const next = createDefaultEditorDraft();
    next.document.identity = { ...profile };
    await persist(next);
  }, [persist]);

  const generate = useCallback(async (): Promise<GenerationRun | null> => {
    if (!draft || !draft.jobDescription.trim()) return null;
    setGenerating(true);
    setGenerateStep("Analyzing job description…");

    try {
      const genResult = await resumeAiMock.generate(
        {
          jobDescription: draft.jobDescription,
          identity: draft.document.identity,
          baseDocument: draft.document,
        },
        draft.model
      );

      let document = genResult.document;
      setGenerateStep("Running refinement pipeline…");

      for (let i = 0; i < draft.refinementSteps.length; i++) {
        const step = draft.refinementSteps[i];
        setGenerateStep(`${step.title} (${i + 1}/${draft.refinementSteps.length})`);
        document = await resumeAiMock.refine(document, step);
      }

      const refinement = estimateRefinementUsage(
        draft.refinementSteps.length,
        draft.jobDescription.length,
        draft.model
      );
      const totalTokens = genResult.tokens + refinement.tokens;
      const totalCost = genResult.costUsd + refinement.costUsd;

      const run: GenerationRun = {
        id: `run-${Date.now()}`,
        status: "completed",
        createdAt: new Date().toISOString(),
        jobTitle: genResult.jobTitle,
        jobDescription: draft.jobDescription,
        model: draft.model,
        provider: draft.provider,
        templateId: draft.templateId,
        tokens: totalTokens,
        costUsd: totalCost,
        document,
        refinementSteps: draft.refinementSteps,
      };

      await saveGenerationRun(run);
      await persist({ ...draft, document });
      return run;
    } catch {
      const run: GenerationRun = {
        id: `run-${Date.now()}`,
        status: "failed",
        createdAt: new Date().toISOString(),
        jobDescription: draft.jobDescription,
        model: draft.model,
        provider: draft.provider,
        templateId: draft.templateId,
        tokens: 0,
        costUsd: 0,
        document: draft.document,
        refinementSteps: draft.refinementSteps,
      };
      await saveGenerationRun(run);
      return run;
    } finally {
      setGenerating(false);
      setGenerateStep(null);
    }
  }, [draft, persist]);

  const updateIdentity = useCallback(
    (field: keyof EditorDraft["document"]["identity"], value: string) => {
      if (!draft) return;
      void persist({
        ...draft,
        document: {
          ...draft.document,
          identity: { ...draft.document.identity, [field]: value },
        },
      });
    },
    [draft, persist]
  );

  const updateDocumentField = useCallback(
    (field: "summary", value: string) => {
      if (!draft) return;
      void persist({
        ...draft,
        document: { ...draft.document, [field]: value },
      });
    },
    [draft, persist]
  );

  const setRefinementSteps = useCallback(
    (steps: RefinementStep[]) => {
      if (!draft) return;
      void persist({ ...draft, refinementSteps: steps });
    },
    [draft, persist]
  );

  return {
    draft,
    loading,
    generating,
    generateStep,
    updateDraft,
    reloadProfile,
    loadFromResume,
    resetDraft,
    generate,
    updateIdentity,
    updateDocumentField,
    setRefinementSteps,
    persist,
  };
}
