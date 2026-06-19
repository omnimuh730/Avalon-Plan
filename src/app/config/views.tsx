import type { ComponentType } from "react";
import type { View } from "../types";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { JobSearchPage } from "../features/job-search/JobSearchPage";
import { ResumesPage } from "../features/resumes/ResumesPage";
import { ApplicationsPage } from "../features/applications/ApplicationsPage";
import { CopilotPage } from "../features/copilot/CopilotPage";
import { AgentsPage } from "../features/agents/AgentsPage";
import { MailPage } from "../features/mail/MailPage";
import { CalendarPage } from "../features/calendar/CalendarPage";
import { InterviewPrepPage } from "../features/interview-prep/InterviewPrepPage";
import { AnalyticsPage } from "../features/analytics/AnalyticsPage";
import { SettingsPage } from "../features/settings/SettingsPage";

export const VIEW_COMPONENTS: Record<View, ComponentType> = {
  dashboard: DashboardPage,
  "job-board": JobSearchPage,
  resumes: ResumesPage,
  ats: ApplicationsPage,
  copilot: CopilotPage,
  agents: AgentsPage,
  mail: MailPage,
  calendar: CalendarPage,
  interviews: InterviewPrepPage,
  reports: AnalyticsPage,
  settings: SettingsPage,
};
