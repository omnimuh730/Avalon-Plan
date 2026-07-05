import type { ElementType } from "react";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Share2,
  Wand2,
  Bot,
  Mail,
  Calendar,
  Video,
  BarChart2,
  Activity,
  Settings,
} from "lucide-react";
import type { View } from "../types";

export type NavItem = {
  id: View;
  label: string;
  icon: ElementType;
  comingSoon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, comingSoon: true },
  { id: "job-board", label: "Job Search", icon: Briefcase },
  { id: "resumes", label: "My Resumes", icon: FileText },
  { id: "ats", label: "My Applications", icon: Share2, comingSoon: true },
  { id: "copilot", label: "Career Copilot", icon: Wand2, comingSoon: true },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "mail", label: "Mail", icon: Mail },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "interviews", label: "Interview Prep", icon: Video, comingSoon: true },
  { id: "vendor-monitor", label: "Vendor Monitor", icon: Activity },
  { id: "reports", label: "Analytics", icon: BarChart2, comingSoon: true },
  { id: "settings", label: "Settings", icon: Settings },
];

export const NAV_GROUPS: { label: string | null; ids: View[] }[] = [
  { label: "WORKSPACE", ids: ["dashboard", "job-board", "resumes"] },
  { label: "PIPELINE", ids: ["ats", "copilot"] },
  { label: "TOOLS", ids: ["agents", "mail", "calendar", "interviews", "vendor-monitor"] },
  { label: "INSIGHTS", ids: ["reports"] },
  { label: null, ids: ["settings"] },
];

export const VIEW_TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  "job-board": "Job Search",
  resumes: "Resume Generator",
  ats: "My Applications",
  copilot: "Career Copilot",
  agents: "AI Agents",
  mail: "Mail",
  calendar: "Calendar",
  interviews: "Interview Prep",
  reports: "Job Search Analytics",
  "vendor-monitor": "Vendor Monitor",
  settings: "Settings",
};
