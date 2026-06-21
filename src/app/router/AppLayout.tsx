import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Sidebar } from "../components/layout/Sidebar";
import { TopNav } from "../components/layout/TopNav";
import { pathForView, viewFromPathname, type NavigateOptions } from "../config/routes";
import { AgentsProvider } from "../context/AgentsContext";
import { ApplierProvider } from "../../context/applier-context";
import { AppNavigationContext } from "../context/AppNavigationContext";
import {
  JobSearchNavigationContext,
  type OpenJobSearchOptions,
} from "../context/JobSearchNavigationContext";
import {
  ResumeNavigationContext,
  type OpenEditorOptions,
  type ResumeNavigationContextValue,
} from "../context/ResumeNavigationContext";
import type { View } from "../types";

function AppProviders({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const routerNavigate = useCallback(
    (view: View, options?: NavigateOptions) => {
      navigate(pathForView(view, options), { replace: options?.replace });
    },
    [navigate],
  );

  const [pendingEditorOpen, setPendingEditorOpen] = useState<OpenEditorOptions | null>(null);
  const [pendingJobFilters, setPendingJobFilters] = useState<OpenJobSearchOptions | null>(null);

  const openEditor = useCallback(
    (opts?: OpenEditorOptions) => {
      const tab = opts?.tab ?? "editor";
      if (opts?.resumeId || opts?.jd) {
        setPendingEditorOpen(opts);
      }
      routerNavigate("resumes", { tab });
    },
    [routerNavigate],
  );

  const clearPendingEditorOpen = useCallback(() => setPendingEditorOpen(null), []);

  const openJobSearch = useCallback(
    (opts?: OpenJobSearchOptions) => {
      setPendingJobFilters(opts ?? null);
      routerNavigate("job-board");
    },
    [routerNavigate],
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

  const appNav = useMemo(() => ({ navigate: routerNavigate }), [routerNavigate]);

  return (
    <ApplierProvider>
      <AgentsProvider>
        <AppNavigationContext.Provider value={appNav}>
          <ResumeNavigationContext.Provider value={resumeNav}>
            <JobSearchNavigationContext.Provider value={jobNav}>{children}</JobSearchNavigationContext.Provider>
          </ResumeNavigationContext.Provider>
        </AppNavigationContext.Provider>
      </AgentsProvider>
    </ApplierProvider>
  );
}

export function AppLayout() {
  const location = useLocation();
  const active = viewFromPathname(location.pathname);

  return (
    <AppProviders>
      <div
        className="h-screen w-screen overflow-hidden bg-background text-foreground flex"
        style={{ fontFamily: "'Figtree',system-ui,sans-serif" }}
      >
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopNav active={active} />
          <main className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
