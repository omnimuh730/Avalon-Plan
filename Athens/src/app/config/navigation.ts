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
  Cpu,
  Activity,
  Flame,
  Clapperboard,
  Settings,
} from "lucide-react";
import type { View } from "../types";

export type NavItem = {
  id: View;
  label: string;
  icon: ElementType;
  comingSoon?: boolean;
  beta?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, comingSoon: true },
  { id: "job-board", label: "Job Search", icon: Briefcase },
  { id: "resumes", label: "My Resumes", icon: FileText },
  { id: "ats", label: "My Applications", icon: Share2, comingSoon: true},
  { id: "copilot", label: "Career Copilot", icon: Wand2, comingSoon: true},
  { id: "agents", label: "Agents", icon: Bot },
  { id: "mail", label: "Mail", icon: Mail },
  { id: "calendar", label: "Calendar", icon: Calendar, comingSoon: true },
  { id: "interviews", label: "Interview Prep", icon: Video, comingSoon: true },
  { id: "vendor-monitor", label: "Vendor Monitor", icon: Activity, beta: true },
  { id: "bid-management", label: "Bid Management", icon: Clapperboard },
  { id: "firebase", label: "Firebase Atlas", icon: Flame },
  { id: "reports", label: "Analytics", icon: BarChart2, comingSoon: true },
  { id: "ai-usage", label: "AI API Usage", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
];

export const NAV_GROUPS: { label: string | null; ids: View[] }[] = [
  { label: "WORKSPACE", ids: ["dashboard", "job-board", "resumes"] },
  { label: "PIPELINE", ids: ["ats", "copilot"] },
  { label: "TOOLS", ids: ["agents", "mail", "calendar", "interviews", "vendor-monitor", "bid-management", "firebase"] },
  { label: "INSIGHTS", ids: ["reports", "ai-usage"] },
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
  "ai-usage": "AI API Usage",
  "vendor-monitor": "Vendor Monitor",
  "bid-management": "Bid Management",
  firebase: "Firebase Atlas",
  settings: "Settings",
};
