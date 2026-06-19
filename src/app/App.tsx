import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TopNav } from "./components/layout/TopNav";
import { VIEW_COMPONENTS } from "./config/views";
import { AgentsProvider } from "./context/AgentsContext";
import { AppNavigationContext } from "./context/AppNavigationContext";
import {
  JobSearchNavigationContext,
  type OpenJobSearchOptions,
} from "./context/JobSearchNavigationContext";
import {
  ResumeNavigationContext,
  type OpenEditorOptions,
  type ResumeNavigationContextValue,
} from "./context/ResumeNavigationContext";
import type { View } from "./types";

function AppProviders({
  children,
  onNavigate,
}: {
  children: React.ReactNode;
  onNavigate: (view: View) => void;
}) {
  const [pendingEditorOpen, setPendingEditorOpen] = useState<OpenEditorOptions | null>(null);
  const [pendingJobFilters, setPendingJobFilters] = useState<OpenJobSearchOptions | null>(null);

  const openEditor = useCallback(
    (opts?: OpenEditorOptions) => {
      setPendingEditorOpen(opts ?? { tab: "editor" });
      onNavigate("resumes");
    },
    [onNavigate],
  );

  const clearPendingEditorOpen = useCallback(() => setPendingEditorOpen(null), []);

  const openJobSearch = useCallback(
    (opts?: OpenJobSearchOptions) => {
      setPendingJobFilters(opts ?? null);
      onNavigate("job-board");
    },
    [onNavigate],
  );

  const clearPendingFilters = useCallback(() => setPendingJobFilters(null), []);

  const resumeNav = useMemo<ResumeNavigationContextValue>(
    () => ({ openEditor, pendingEditorOpen, clearPendingEditorOpen }),
    [openEditor, pendingEditorOpen, clearPendingEditorOpen],
  );

  const jobNav = useMemo(
    () => ({ openJobSearch, pendingFilters: pendingJobFilters, clearPendingFilters }),
    [openJobSearch, pendingJobFilters, clearPendingFilters],
  );

  const appNav = useMemo(() => ({ navigate: onNavigate }), [onNavigate]);

  return (
    <AgentsProvider>
      <AppNavigationContext.Provider value={appNav}>
        <ResumeNavigationContext.Provider value={resumeNav}>
          <JobSearchNavigationContext.Provider value={jobNav}>{children}</JobSearchNavigationContext.Provider>
        </ResumeNavigationContext.Provider>
      </AppNavigationContext.Provider>
    </AgentsProvider>
  );
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const Page = VIEW_COMPONENTS[view];
  const navigate = useCallback((v: View) => setView(v), []);

  return (
    <AppProviders onNavigate={navigate}>
      <div
        className="h-screen w-screen overflow-hidden bg-background text-foreground flex"
        style={{ fontFamily: "'Figtree',system-ui,sans-serif" }}
      >
        <Sidebar active={view} set={setView} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopNav active={view} />
          <main className="flex-1 min-h-0 overflow-hidden">
            <Page />
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
