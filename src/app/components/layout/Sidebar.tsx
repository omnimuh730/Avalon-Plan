import React from "react";
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
  Zap,
  ChevronDown,
  Plus,
  MoreHorizontal,
} from "lucide-react";
import { cn, display } from "../../lib/utils";
import type { View } from "../../types";

const NAV: { id: View; label: string; icon: React.ElementType; badge?: number }[] = [
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

const GROUPS = [
  { label: "WORKSPACE", ids: ["dashboard", "job-board", "resumes"] as View[] },
  { label: "PIPELINE", ids: ["ats", "copilot"] as View[] },
  { label: "TOOLS", ids: ["agents", "mail", "calendar", "interviews"] as View[] },
  { label: null, ids: ["reports", "settings"] as View[] },
];

export function Sidebar({
  active,
  set,
}: {
  active: View;
  set: (v: View) => void;
}) {
  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col h-full border-r border-border shadow-sm"
      style={{ background: "var(--sidebar)" }}
    >
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3 cursor-pointer">
          <div className="w-10 h-10 rounded-xl bg-primary shadow-md shadow-violet-500/25 flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-base font-bold text-foreground block" style={display}>
              AthenAI
            </span>
            <span className="text-xs text-muted-foreground">AI career command center</span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground opacity-50 flex-shrink-0" />
        </div>
      </div>

      <div className="px-4 py-3">
        <button className="w-full flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm shadow-violet-500/20 min-h-10">
          <Plus className="w-5 h-5" />
          New Application
        </button>
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto subtle-scroll space-y-5">
        {GROUPS.map((g, gi) => (
          <div key={gi}>
            {g.label && (
              <p className="px-3 mb-2 text-xs font-bold tracking-wider text-muted-foreground/60 uppercase">
                {g.label}
              </p>
            )}
            <div className="space-y-1">
              {NAV.filter((n) => g.ids.includes(n.id)).map((item) => (
                <button
                  key={item.id}
                  onClick={() => set(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-100 min-h-10",
                    active === item.id
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary font-semibold"
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && (
                    <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-secondary cursor-pointer transition-colors group">
          <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">Jordan Doe</p>
            <p className="text-xs text-muted-foreground">Job Seeker</p>
          </div>
          <MoreHorizontal className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </aside>
  );
}
