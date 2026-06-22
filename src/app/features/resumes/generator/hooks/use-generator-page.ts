import { useCallback, useEffect, useMemo, useState } from "react";
import type { DropdownOption } from "../adapters/ui";
import { useNotify } from "../adapters/notify";
import { useApi } from "@/api/useApi";
import { API_BASE } from "@/lib/api-base";
import { useApplier } from "@/context/applier-context";
import { buildResumeModel } from "../build-resume-model";
import { templateById } from "../constants/templates";
import {
  defaultConfig,
  defaultPromptFor,
  ensurePurposes,
  FALLBACK_MODELS,
  uid,
  fontStack,
} from "../constants/defaults";
import { JOB_DESC_TOKEN } from "../constants/tokens";
import { normalizeGenerated, mergeGeneratedSection } from "../utils/content";
import { identityFromProfile, isValidJson, storageKey } from "../utils/identity";
import { streamSSE } from "../utils/sse";
import type {
  GenProgress,
  GeneratedContent,
  GeneratorConfig,
  GenStep,
  Identity,
  LayoutSection,
  PreviewEdit,
  Purpose,
  ResumeTheme,
  StepKind,
  UsageBreakdown,
} from "../types";
import { PURPOSES, SECTION_LABEL } from "../types";

export type GeneratorPageVm = ReturnType<typeof useGeneratorPage>;

export function useGeneratorPage() {
  const { get, put } = useApi(API_BASE);
  const { applier } = useApplier();
  const { notify } = useNotify();

  const [config, setConfig] = useState<GeneratorConfig>(defaultConfig);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [planJson, setPlanJson] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageBreakdown | null>(null);
  const [genProgress, setGenProgress] = useState<GenProgress | null>(null);
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);
  const [view, setView] = useState<"editor" | "history">("editor");
  const [editorPanel, setEditorPanel] = useState<"document" | "pipeline">("document");
  const [previewStep, setPreviewStep] = useState<number | null>(null);

  const { theme, layout, steps } = config;
  const template = templateById(config.templateId);
  const [exporting, setExporting] = useState<null | "pdf" | "docx">(null);

  // Reference tokens a prompt can use, resolved from the JD + profile careers.
  // Mirrors the backend substitution in resumeGenController so the chip previews
  // match what generation will actually inject. {companyN_*} are 1-based by role.
  const tokenValues: Record<string, string> = (() => {
    const careers = identity?.careers ?? [];
    const map: Record<string, string> = {
      job_description: config.jobDescription || "",
      career: careers
        .map((c) => [c.title, c.company, c.period].filter(Boolean).join(" | "))
        .filter(Boolean)
        .join("\n"),
    };
    careers.forEach((c, i) => {
      const n = i + 1;
      map[`company${n}_name`] = c.company || "";
      map[`company${n}_title`] = c.title || "";
      map[`company${n}_duration`] = c.period || "";
    });
    return map;
  })();
  const setTheme = (patch: Partial<ResumeTheme>) => setConfig((c) => ({ ...c, theme: { ...c.theme, ...patch } }));

  // Export the live preview to PDF via the backend (headless Chromium). We send
  // the preview's already-rendered, inline-styled DOM so the PDF matches exactly,
  // and let the server paginate with real per-page margins.
  // Export the live preview to PDF or Word. Both reuse the exact same rendered
  // HTML so the document styling stays consistent across formats.
  const exportResume = async (format: "pdf" | "docx") => {
    const fileName = `${(identity?.fullName || "resume").replace(/\s+/g, "_")}.${format}`;
    let payload: Record<string, unknown>;
    if (format === "pdf") {
      // PDF renders the live DOM via puppeteer (pixel-exact with the preview).
      const pageEl = document.querySelector("#resume-print-root .resume-page") as HTMLElement | null;
      if (!pageEl) {
        notify({ title: "Nothing to export", description: "The resume preview isn't ready yet.", tone: "warning" });
        return;
      }
      const fontLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map((l) => (l as HTMLLinkElement).href)
        .filter((h) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(h));
      payload = { html: pageEl.innerHTML, paper: theme.paper, marginInches: theme.margin, font: fontStack(theme.font), baseSizePt: theme.baseSize, fontLinks, fileName };
    } else {
      // Word is built from a structured model (spec-valid OOXML, opens in Word).
      payload = { model: buildResumeModel(config, generated, identity), paper: theme.paper, marginInches: theme.margin, font: fontStack(theme.font), fileName };
    }
    setExporting(format);
    try {
      const endpoint = format === "pdf" ? "/personal/resume-pdf" : "/personal/resume-docx";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = `Export failed (${res.status})`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j?.error) msg = j.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify({
        title: `Export ${format === "pdf" ? "PDF" : "Word"} failed`,
        description: e instanceof Error ? e.message : String(e),
        tone: "error",
      });
    } finally {
      setExporting(null);
    }
  };
  // Selecting a template applies its default header alignment plus any preset
  // theme tokens it ships with (font/accent) — e.g. Modern switches to a sans
  // font + blue accent. Other theme tokens (sizes, colors you changed) persist.
  const selectTemplate = (id: string) =>
    setConfig((c) => {
      const t = templateById(id);
      const nextAccent = t.defaults?.accent ?? c.theme.accent;
      return {
        ...c,
        templateId: id,
        theme: {
          ...c.theme,
          headerAlign: t.defaultHeaderAlign,
          font: t.defaults?.font ?? c.theme.font,
          accent: nextAccent,
        },
        // Recolor section titles that were following the old accent.
        layout: c.layout.map((s) => (s.titleColor === c.theme.accent ? { ...s, titleColor: nextAccent } : s)),
      };
    });

  // Restore saved config for this applier.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(applier?.name));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GeneratorConfig>;
        const base = defaultConfig();
        setConfig(
          ensurePurposes({
            provider: parsed.provider === "deepseek" ? "deepseek" : "openai",
            model: parsed.model ?? base.model,
            reasoningEffort: parsed.reasoningEffort ?? base.reasoningEffort,
            templateId: parsed.templateId ?? base.templateId,
            theme: { ...base.theme, ...(parsed.theme ?? {}) },
            layout: Array.isArray(parsed.layout) && parsed.layout.length ? (parsed.layout as LayoutSection[]) : base.layout,
            systemInstruction: parsed.systemInstruction ?? base.systemInstruction,
            jobDescription: parsed.jobDescription ?? base.jobDescription,
            steps: Array.isArray(parsed.steps) && parsed.steps.length ? (parsed.steps as GenStep[]) : base.steps,
          }),
        );
      } else {
        setConfig(defaultConfig());
      }
    } catch {
      setConfig(defaultConfig());
    }
  }, [applier?.name]);

  // Prefer the config saved in the DB for this applier (falls back to the
  // localStorage value loaded above). Runs after the applier changes.
  useEffect(() => {
    const applierName = applier?.name;
    if (!applierName) return;
    let cancelled = false;
    get(`/personal/resume-generator/config?applierName=${encodeURIComponent(applierName)}`)
      .then((raw) => {
        const dbConfig = (raw as { success?: boolean; config?: Partial<GeneratorConfig> | null })?.config;
        if (cancelled || !dbConfig || typeof dbConfig !== "object") return;
        const base = defaultConfig();
        setConfig(
          ensurePurposes({
            provider: dbConfig.provider === "deepseek" ? "deepseek" : "openai",
            model: dbConfig.model ?? base.model,
            reasoningEffort: dbConfig.reasoningEffort ?? base.reasoningEffort,
            templateId: dbConfig.templateId ?? base.templateId,
            theme: { ...base.theme, ...(dbConfig.theme ?? {}) },
            layout: Array.isArray(dbConfig.layout) && dbConfig.layout.length ? (dbConfig.layout as LayoutSection[]) : base.layout,
            systemInstruction: dbConfig.systemInstruction ?? base.systemInstruction,
            jobDescription: dbConfig.jobDescription ?? base.jobDescription,
            steps: Array.isArray(dbConfig.steps) && dbConfig.steps.length ? (dbConfig.steps as GenStep[]) : base.steps,
          }),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [applier?.name, get]);

  // Persist config: localStorage immediately + the DB (debounced) so all
  // generator settings survive across devices/sessions.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(applier?.name), JSON.stringify(config));
    } catch {
      /* storage unavailable */
    }
    const applierName = applier?.name;
    if (!applierName) return;
    const t = setTimeout(() => {
      void put("/personal/resume-generator/config", { applierName, config }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [config, applier?.name, put]);

  const loadIdentity = useCallback(async () => {
    const applierName = applier?.name;
    if (!applierName) {
      setIdentity(null);
      return;
    }
    setLoadingProfile(true);
    try {
      const raw = (await get(`/personal/auto-bid-profile?applierName=${encodeURIComponent(applierName)}`)) as {
        success?: boolean;
        profile?: Record<string, unknown>;
        data?: { profile?: Record<string, unknown> };
      };
      const profile = raw?.profile ?? raw?.data?.profile;
      if (raw?.success && profile && typeof profile === "object") setIdentity(identityFromProfile(profile));
      else {
        setIdentity(null);
        notify({ title: "No profile found", description: `No profile data for ${applierName}.`, tone: "warning" });
      }
    } catch {
      setIdentity(null);
      notify({ title: "Could not load profile", description: "Failed to fetch applier profile.", tone: "error" });
    } finally {
      setLoadingProfile(false);
    }
  }, [applier?.name, get, notify]);

  useEffect(() => {
    void loadIdentity();
  }, [loadIdentity]);

  // Pull the provider's live model list (needs the applier's API key in profile).
  const loadModels = useCallback(
    async (force = false) => {
      const applierName = applier?.name;
      if (!applierName) {
        setModels([]);
        setModelsNote("Select an applier to load models.");
        return;
      }
      setModelsLoading(true);
      setModelsNote(null);
      try {
        const res = (await get(
          `/personal/llm-models?provider=${config.provider}&applierName=${encodeURIComponent(applierName)}${force ? "&force=1" : ""}`,
        )) as { success?: boolean; models?: string[]; error?: string };
        if (res?.success && Array.isArray(res.models) && res.models.length) {
          const list = res.models;
          setModels(list);
          setModelsNote(null);
          // Self-heal: if the saved model isn't a real model for this provider
          // (e.g. a typo like "gpt-5.4-nano"), switch to the first valid one.
          setConfig((c) => (list.includes(c.model) ? c : { ...c, model: list[0] }));
        } else {
          setModels([]);
          setModelsNote(res?.error || "No models returned — using defaults.");
        }
      } catch {
        setModels([]);
        setModelsNote("Could not reach the model list — using defaults.");
      } finally {
        setModelsLoading(false);
      }
    },
    [applier?.name, config.provider, get],
  );

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  // Available model options: live list when present, otherwise the fallback.
  const modelOptions: DropdownOption<string>[] = useMemo(() => {
    const list = models.length ? models : FALLBACK_MODELS[config.provider];
    const opts = list.map((m) => ({ value: m, label: m }));
    // Keep the currently-selected model visible even if it isn't in the list.
    if (config.model && !list.includes(config.model)) opts.unshift({ value: config.model, label: config.model });
    return opts;
  }, [models, config.provider, config.model]);

  // --- layout ops -----------------------------------------------------------
  const patchSection = (id: string, patch: Partial<LayoutSection>) =>
    setConfig((c) => ({ ...c, layout: c.layout.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const moveSection = (id: string, dir: -1 | 1) =>
    setConfig((c) => {
      const i = c.layout.findIndex((s) => s.id === id);
      const t = i + dir;
      if (i < 0 || t < 0 || t >= c.layout.length) return c;
      const layout = [...c.layout];
      [layout[i], layout[t]] = [layout[t], layout[i]];
      return { ...c, layout };
    });
  const applyPalette = (accent: string, text: string) =>
    setConfig((c) => ({
      ...c,
      theme: { ...c.theme, accent, text },
      // Recolor section titles still using the previous accent.
      layout: c.layout.map((s) => (s.titleColor === c.theme.accent ? { ...s, titleColor: accent } : s)),
    }));

  // --- step ops -------------------------------------------------------------
  const patchStep = (id: string, patch: Partial<GenStep>) =>
    setConfig((c) => ({ ...c, steps: c.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const moveStep = (id: string, dir: -1 | 1) =>
    setConfig((c) => {
      const i = c.steps.findIndex((s) => s.id === id);
      const t = i + dir;
      if (i < 0 || t < 0 || t >= c.steps.length) return c;
      const steps = [...c.steps];
      [steps[i], steps[t]] = [steps[t], steps[i]];
      return { ...c, steps };
    });
  const removeStep = (id: string) =>
    setConfig((c) => {
      const target = c.steps.find((s) => s.id === id);
      if (!target || target.kind === "final") return c; // never drop a final step
      return { ...c, steps: c.steps.filter((s) => s.id !== id) };
    });
  const addFineTune = (purpose: Purpose) => {
    const count = config.steps.filter((s) => s.purpose === purpose && s.kind === "fine-tune").length;
    setConfig((c) => ({
      ...c,
      steps: [
        ...c.steps,
        {
          id: uid(),
          purpose,
          kind: "fine-tune",
          name: `${SECTION_LABEL[purpose]} — fine-tune ${count + 1}`,
          prompt: defaultPromptFor(purpose, "fine-tune"),
          schema: "",
        },
      ],
    }));
  };

  const setIdentityField = (key: keyof Identity, value: string) =>
    setIdentity((prev) => (prev ? { ...prev, [key]: value } : prev));

  // --- validation -----------------------------------------------------------
  const validation = useMemo(() => {
    const errors: string[] = [];
    for (const p of PURPOSES) {
      const finals = steps.filter((s) => s.purpose === p && s.kind === "final");
      if (finals.length === 0) errors.push(`${SECTION_LABEL[p]} has no final prompt (exactly 1 required).`);
      else if (finals.length > 1) errors.push(`${SECTION_LABEL[p]} has ${finals.length} final prompts (exactly 1 required).`);
      for (const f of finals) if (!isValidJson(f.schema)) errors.push(`${SECTION_LABEL[p]} final schema is invalid JSON.`);
    }
    return errors;
  }, [steps]);

  const finalCountByPurpose = useMemo(() => {
    const m: Record<Purpose, number> = { summary: 0, skills: 0, experience: 0 };
    for (const s of steps) if (s.kind === "final") m[s.purpose] += 1;
    return m;
  }, [steps]);

  // Ordered AI request plan (independent of layout order).
  const plan = useMemo(
    () =>
      steps.map((s, i) => ({
        index: i + 1,
        purpose: s.purpose,
        kind: s.kind,
        name: s.name,
        prompt: s.prompt,
        ...(s.kind === "final" ? { schema: isValidJson(s.schema) ? JSON.parse(s.schema) : s.schema } : {}),
      })),
    [steps],
  );

  const requestPayload = useMemo(
    () => ({
      applierName: applier?.name ?? null,
      provider: config.provider,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      templateId: config.templateId,
      template: { columns: template.columns, sidebar: template.sidebar, heading: template.heading, headingAlign: template.headingAlign },
      theme: config.theme,
      layout: config.layout.map((s) => ({ type: s.type, title: s.title, titleColor: s.titleColor, titleSize: s.titleSize, bodySize: s.bodySize })),
      identity,
      systemInstruction: config.systemInstruction,
      jobDescription: config.jobDescription,
      steps: plan,
    }),
    [applier?.name, config, identity, plan, template],
  );

  // Download a full JSON trace of the generation: config, resolved prompts,
  // per-step model output + token/cost, totals, and the assembled sections.
  const handleDownloadLog = () => {
    const jd = config.jobDescription;
    const resolve = (t: string) => t.split(JOB_DESC_TOKEN).join(jd);
    const log = {
      meta: {
        generatedAt: new Date().toISOString(),
        applier: applier?.name ?? null,
        provider: config.provider,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        templateId: config.templateId,
      },
      jobDescription: jd,
      systemInstruction: { template: config.systemInstruction, resolved: resolve(config.systemInstruction) },
      steps: (genProgress?.steps ?? []).map((st) => {
        const def = config.steps[st.index - 1];
        return {
          index: st.index,
          name: st.name,
          purpose: st.purpose,
          kind: st.kind,
          prompt: def?.prompt ?? null,
          promptResolved: def ? resolve(def.prompt) : null,
          schema: def && def.kind === "final" && isValidJson(def.schema) ? JSON.parse(def.schema) : undefined,
          // Note: OpenAI/DeepSeek chat-completions do not return the model's
          // hidden reasoning, so only the final reply + token usage are logged.
          output: st.output ?? null,
          usage: st.usage ?? null,
        };
      }),
      totalUsage: usage,
      sections: generated,
    };
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resume-generation-log-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Inline edits from the preview (summary text / experience bullets) write back
  // into the generated content so Export PDF, the saved config, and History all
  // reflect them.
  const handlePreviewEdit = useCallback((e: PreviewEdit) => {
    setGenerated((prev) => {
      if (!prev) return prev;
      if (e.kind === "summary") return { ...prev, summary: e.text };
      const experience = (prev.experience ?? []).map((exp, i) =>
        i === e.exp ? { ...exp, bullets: exp.bullets.map((b, j) => (j === e.bullet ? e.text : b)) } : exp,
      );
      return { ...prev, experience };
    });
  }, []);

  const handleGenerate = async () => {
    if (!applier?.name) {
      notify({ title: "Select an applier", description: "Choose your account in the sidebar.", tone: "warning" });
      return;
    }
    if (validation.length > 0) {
      notify({ title: "Fix step configuration", description: validation[0], tone: "error" });
      return;
    }
    setGenerating(true);
    setUsage(null);
    setGenerated(null);
    setGenProgress({ steps: [], cumulative: null, done: false });
    let failed = false;
    try {
      await streamSSE(`${API_BASE}/personal/resume-generate/stream`, requestPayload, (event, data) => {
        if (event === "step") {
          if (data.phase === "step-start") {
            setGenProgress((p) => ({
              steps: [
                ...(p?.steps ?? []),
                { index: data.index as number, name: String(data.name), purpose: String(data.purpose), kind: String(data.kind), status: "running" },
              ],
              cumulative: p?.cumulative ?? null,
              done: false,
            }));
          } else if (data.phase === "step-done") {
            setGenProgress((p) => ({
              steps: (p?.steps ?? []).map((s) =>
                s.index === data.index ? { ...s, status: "done", usage: data.usage as UsageBreakdown, output: data.output } : s,
              ),
              cumulative: (data.cumulative as UsageBreakdown) ?? p?.cumulative ?? null,
              done: false,
            }));
            // Update the preview section the moment its FINAL step finishes —
            // experience can render before skills/summary are even started.
            if (data.kind === "final" && data.output != null) {
              setGenerated((prev) => mergeGeneratedSection(prev, String(data.purpose), data.output));
            }
          }
        } else if (event === "done") {
          setUsage((data.usage as UsageBreakdown) ?? null);
          setGenerated(normalizeGenerated(data.sections as Record<string, unknown> | undefined));
          setGenProgress((p) => (p ? { ...p, cumulative: (data.usage as UsageBreakdown) ?? p.cumulative, done: true } : p));
          notify({ title: "Resume generated", description: "Result is shown in the live preview.", tone: "success" });
        } else if (event === "error") {
          failed = true;
          const status = data.status as number | undefined;
          notify({
            title: status === 429 ? "Rate limited" : "Generation failed",
            description: String(data.error || "Generation failed — see backend logs."),
            tone: status === 429 ? "warning" : "error",
          });
        }
      });
    } catch {
      if (!failed) notify({ title: "Generation failed", description: "Lost connection to the backend stream.", tone: "error" });
    } finally {
      setGenerating(false);
    }
  };

  return {
    applier,
    config,
    setConfig,
    identity,
    setIdentity,
    loadingProfile,
    generating,
    planJson,
    setPlanJson,
    models,
    modelsLoading,
    modelsNote,
    usage,
    setUsage,
    genProgress,
    generated,
    setGenerated,
    view,
    setView,
    editorPanel,
    setEditorPanel,
    previewStep,
    setPreviewStep,
    theme,
    layout,
    steps,
    template,
    exporting,
    tokenValues,
    setTheme,
    exportResume,
    selectTemplate,
    loadIdentity,
    loadModels,
    modelOptions,
    patchSection,
    moveSection,
    applyPalette,
    patchStep,
    moveStep,
    removeStep,
    addFineTune,
    setIdentityField,
    validation,
    finalCountByPurpose,
    plan,
    requestPayload,
    handleDownloadLog,
    handlePreviewEdit,
    handleGenerate,
  };
}
