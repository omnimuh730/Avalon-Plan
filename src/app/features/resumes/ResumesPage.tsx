import React, { useCallback, useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill } from "../../components/ui";
import { useResumeNavigationOptional } from "../../context/ResumeNavigationContext";
import { initResumeStorage } from "../../services/resumeStorage";
import { ResumeLibraryTab } from "./components/ResumeLibraryTab";
import { ResumeEditorTab } from "./components/ResumeEditorTab";
import { ResumeHistoryTab } from "./components/ResumeHistoryTab";
import { ResumeSetupTab } from "./components/ResumeSetupTab";
import { ResumeAnalysisTab } from "./components/ResumeAnalysisTab";

const TABS = ["library", "editor", "history", "analysis", "setup"] as const;
type ResumeTab = (typeof TABS)[number];

export function ResumesPage() {
  const nav = useResumeNavigationOptional();
  const [tab, setTab] = useState<ResumeTab>("library");
  const [editorJd, setEditorJd] = useState<string | undefined>();
  const [editorResumeId, setEditorResumeId] = useState<string | undefined>();
  const [analysisResumeId, setAnalysisResumeId] = useState<string | undefined>();
  const [ready, setReady] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    initResumeStorage().then(() => setReady(true));
  }, []);

  useEffect(() => {
    const pending = nav?.pendingEditorOpen;
    if (!pending || !ready) return;
    if (pending.tab) setTab(pending.tab);
    else setTab("editor");
    if (pending.jd) setEditorJd(pending.jd);
    if (pending.resumeId) {
      if (pending.tab === "analysis") setAnalysisResumeId(pending.resumeId);
      else setEditorResumeId(pending.resumeId);
    }
    nav.clearPendingEditorOpen();
  }, [nav?.pendingEditorOpen, ready, nav]);

  const openEditor = useCallback((opts?: { resumeId?: string; jd?: string }) => {
    setEditorResumeId(opts?.resumeId);
    setEditorJd(opts?.jd);
    setTab("editor");
  }, []);

  const openAnalysis = useCallback((opts?: { resumeId?: string }) => {
    setAnalysisResumeId(opts?.resumeId);
    setTab("analysis");
  }, []);

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

        {tab === "library" && <ResumeLibraryTab onOpenEditor={openEditor} onOpenAnalysis={openAnalysis} />}
        {tab === "analysis" && <ResumeAnalysisTab initialResumeId={analysisResumeId} />}
        {tab === "setup" && <ResumeSetupTab />}
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
                initialResumeId={editorResumeId}
                onGenerated={() => setHistoryKey((k) => k + 1)}
                onSwitchToHistory={() => setTab("history")}
              />
            </div>
          </div>
        )}
        {tab === "history" && <ResumeHistoryTab key={historyKey} />}
      </div>
    </PageShell>
  );
}
