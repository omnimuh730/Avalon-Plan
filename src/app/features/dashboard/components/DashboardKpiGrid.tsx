import React from "react";
import {
  Briefcase,
  Video,
  FileText,
  UserCheck,
  Clock,
  Bot,
  Calendar,
  Sparkles,
} from "lucide-react";
import { KPI } from "../../../components/ui";

export function DashboardKpiGrid() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Active Applications" value="13" trend="+3 this week" icon={Briefcase} accent="violet" />
        <KPI label="Interviews This Week" value="5" sub="2 confirmed" icon={Video} accent="blue" />
        <KPI label="Response Rate" value="38%" trend="+6pts" sub="vs last month" icon={UserCheck} accent="emerald" />
        <KPI label="Jobs Saved" value="24" trend="+8" sub="ready to apply" icon={FileText} accent="amber" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="Offers Received" value="2" sub="1 pending decision" icon={Sparkles} accent="pink" />
        <KPI label="Avg Response Time" value="4.2d" sub="↓1.3d improvement" icon={Clock} accent="teal" />
        <KPI label="Active Agents" value="3" sub="12 tasks running" icon={Bot} accent="violet" />
        <KPI label="Interviews Today" value="2" sub="Notion · Meta" icon={Calendar} accent="rose" />
      </div>
    </>
  );
}
