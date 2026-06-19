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
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PageShell } from "../components/layout/PageShell";
import { KPI } from "../components/ui/KPI";
import { ChartTip } from "../components/ui/ChartTip";
import { cn, display, mono } from "../lib/utils";
import { AREA_DATA, SRC_DATA, ACTIVITIES, AI_RECS, FUNNEL } from "../data/shared";

export function Dashboard() {
  return (
    <PageShell>
      <div className="space-y-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-bold text-foreground">Application Activity</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Submissions, responses & interviews — 6 month trend
                </p>
              </div>
              <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
                {["1M", "3M", "6M", "1Y"].map((t, i) => (
                  <button
                    key={t}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors min-h-9",
                      i === 2
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={AREA_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  {[["gA", "#6c5ce7"], ["gR", "#2dd4bf"], ["gI", "#f472b6"]].map(([id, c]) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={c} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="m" tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="apps" name="Applications" stroke="#6c5ce7" strokeWidth={2} fill="url(#gA)" />
                <Area type="monotone" dataKey="responses" name="Responses" stroke="#2dd4bf" strokeWidth={2} fill="url(#gR)" />
                <Area type="monotone" dataKey="interviews" name="Interviews" stroke="#f472b6" strokeWidth={2} fill="url(#gI)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-1">Application Funnel</h3>
            <p className="text-sm text-muted-foreground mb-5">Your conversion across stages</p>
            <div className="space-y-4">
              {FUNNEL.map((f, i) => (
                <div key={f.s}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-muted-foreground font-semibold">{f.s}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground font-bold" style={mono}>{f.n}</span>
                      <span className="text-xs text-muted-foreground" style={mono}>{f.p}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 bg-primary"
                      style={{ width: `${f.p}%`, opacity: 1 - i * 0.12 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-5">Activity Feed</h3>
            <div className="space-y-4">
              {ACTIVITIES.map((a, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <a.icon className={cn("w-5 h-5 mt-0.5 flex-shrink-0", a.c)} />
                  <div>
                    <p className="text-sm text-foreground/85 leading-relaxed">{a.t}</p>
                    <p className="text-xs text-muted-foreground mt-1">{a.ts}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-1">Source Performance</h3>
            <p className="text-sm text-muted-foreground mb-5">Applications vs responses by channel</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={SRC_DATA} margin={{ top: 0, right: 0, bottom: 0, left: -26 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="src" tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b6b84", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="apps" name="Applied" fill="#6c5ce7" opacity={0.7} radius={[4, 4, 0, 0]} />
                <Bar dataKey="responses" name="Responses" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <h3 className="text-sm font-bold text-foreground flex-1">AI Recommendations</h3>
              <Sparkles className="w-5 h-5 text-violet-600" />
            </div>
            <div className="space-y-3">
              {AI_RECS.map((r, i) => (
                <div
                  key={i}
                  className="border border-border rounded-xl p-4 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <p className="text-sm text-foreground/75 leading-relaxed mb-2">{r.t}</p>
                  <span className={cn("text-sm font-bold group-hover:underline", r.c)}>{r.a}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
