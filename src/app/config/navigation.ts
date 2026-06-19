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
  Settings,
} from "lucide-react";
import type { View } from "../types";

export type NavItem = {
  id: View;
  label: string;
  icon: ElementType;
  badge?: number;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "job-board", label: "Job Search", icon: Briefcase },
  { id: "resumes", label: "My Resumes", icon: FileText },
  { id: "ats", label: "My Applications", icon: Share2 },
  { id: "copilot", label: "Career Copilot", icon: Wand2 },
  { id: "agents", label: "Agents", icon: Bot, badge: 3 },
  { id: "mail", label: "Mail", icon: Mail, badge: 2 },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "interviews", label: "Interview Prep", icon: Video },
  { id: "reports", label: "Analytics", icon: BarChart2 },
  { id: "settings", label: "Settings", icon: Settings },
];

export const NAV_GROUPS: { label: string | null; ids: View[] }[] = [
  { label: "WORKSPACE", ids: ["dashboard", "job-board", "resumes"] },
  { label: "PIPELINE", ids: ["ats", "copilot"] },
  { label: "TOOLS", ids: ["agents", "mail", "calendar", "interviews"] },
  { label: null, ids: ["reports", "settings"] },
];

export const VIEW_TITLES: Record<View, string> = {
  dashboard: "Dashboard",
  "job-board": "Job Search",
  resumes: "My Resumes",
  ats: "My Applications",
  copilot: "Career Copilot",
  agents: "AI Agents",
  mail: "Mail",
  calendar: "Calendar",
  interviews: "Interview Prep",
  reports: "Job Search Analytics",
  settings: "Settings",
};
