import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Wand2 } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { TabTransition } from "../../components/overlays";
import { DEFAULT_TABS, normalizeTab, PATHS, type ResumesTab } from "../../config/routes";
import { useResumeNavigationOptional } from "../../context/ResumeNavigationContext";
import { initResumeStorage } from "../../services/resumeStorage";
import type { EditorDraft } from "../../types/resume";
import { ResumeLibraryTab } from "./components/ResumeLibraryTab";
import { ResumeEditorTab } from "./components/ResumeEditorTab";
import { ResumeHistoryTab } from "./components/ResumeHistoryTab";
import { ResumeAnalysisTab } from "./components/ResumeAnalysisTab";

const TABS = ["library", "editor", "history", "analysis"] as const satisfies readonly ResumesTab[];

export function ResumesPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const nav = useResumeNavigationOptional();
  const tab = normalizeTab(tabParam, TABS, DEFAULT_TABS.resumes);
  const setTab = useCallback(
    (next: ResumesTab) => navigate(`${PATHS.resumes}/${next}`),
    [navigate],
  );

  const [editorJd, setEditorJd] = useState<string | undefined>();
  const [ready, setReady] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [historyLoad, setHistoryLoad] = useState<{ config: Partial<EditorDraft>; sections?: Record<string, unknown> } | null>(null);

  useEffect(() => {
    initResumeStorage().then(() => setReady(true));
  }, []);

  useEffect(() => {
    const pending = nav?.pendingEditorOpen;
    if (!pending || !ready) return;
    const nextTab = pending.tab ?? "editor";
    if (pending.jd) setEditorJd(pending.jd);
    navigate(`${PATHS.resumes}/${nextTab}`);
    nav.clearPendingEditorOpen();
  }, [nav?.pendingEditorOpen, ready, nav, navigate]);

  const openEditor = useCallback(
    (opts?: { jd?: string }) => {
      if (opts?.jd) setEditorJd(opts.jd);
      navigate(`${PATHS.resumes}/editor`);
    },
    [navigate],
  );

  const handleLoadFromHistory = useCallback(
    (payload: { config: Partial<EditorDraft>; sections?: Record<string, unknown> }) => {
      setHistoryLoad(payload);
      setEditorJd(payload.config.jobDescription);
      navigate(`${PATHS.resumes}/editor`);
    },
    [navigate],
  );

  if (!ready) {
    return (
      <PageShell>
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading resume data…</div>
      </PageShell>
    );
  }

  const tabPills = (
    <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 scroll-row">
      {TABS.map((t) => (
        <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </Pill>
      ))}
    </div>
  );

  return (
    <PageShell fullWidth={tab === "editor"}>
      <div className={tab === "editor" ? "h-full flex flex-col overflow-hidden" : "page-container"}>
        {tab !== "editor" && (
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            {tabPills}
            <button
              type="button"
              onClick={() => setTab("editor")}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10"
            >
              <Wand2 className="w-4 h-4" />Generate
            </button>
          </div>
        )}

        <TabTransition tabKey={tab}>
          {tab === "library" && <ResumeLibraryTab onOpenAnalysis={() => setTab("analysis")} />}
          {tab === "analysis" && <ResumeAnalysisTab onGoToLibrary={() => setTab("library")} />}
          {tab === "history" && (
            <ResumeHistoryTab key={historyKey} onLoadIntoEditor={handleLoadFromHistory} />
          )}
        </TabTransition>
        {tab === "editor" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 m-4 mb-0 w-fit scroll-row flex-shrink-0">
              {TABS.map((t) => (
                <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Pill>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              <ResumeEditorTab
                initialJd={editorJd}
                loadFromHistory={historyLoad}
                onHistoryLoaded={() => setHistoryLoad(null)}
                onGenerated={() => setHistoryKey((k) => k + 1)}
                onSwitchToHistory={() => setTab("history")}
              />
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
