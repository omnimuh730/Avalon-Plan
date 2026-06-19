import React, { useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TopNav } from "./components/layout/TopNav";
import { Dashboard } from "./views/Dashboard";
import { JobSearch } from "./views/JobSearch";
import { MyResumes } from "./views/MyResumes";
import { ApplicationsPipeline } from "./views/ApplicationsPipeline";
import { CareerCopilot } from "./views/CareerCopilot";
import { AgentsView } from "./views/Agents";
import { MailView } from "./views/Mail";
import { CalendarView } from "./views/Calendar";
import { InterviewPrep } from "./views/InterviewPrep";
import { AnalyticsView } from "./views/Analytics";
import { SettingsView } from "./views/Settings";
import type { View } from "./types";

export default function App() {
  const [view, setView] = useState<View>("dashboard");

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-background text-foreground flex"
      style={{ fontFamily: "'Figtree',system-ui,sans-serif" }}
    >
      <Sidebar active={view} set={setView} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav active={view} />
        <main className="flex-1 min-h-0 overflow-hidden">
          {view === "dashboard" && <Dashboard />}
          {view === "job-board" && <JobSearch />}
          {view === "resumes" && <MyResumes />}
          {view === "ats" && <ApplicationsPipeline />}
          {view === "copilot" && <CareerCopilot />}
          {view === "agents" && <AgentsView />}
          {view === "mail" && <MailView />}
          {view === "calendar" && <CalendarView />}
          {view === "interviews" && <InterviewPrep />}
          {view === "reports" && <AnalyticsView />}
          {view === "settings" && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
