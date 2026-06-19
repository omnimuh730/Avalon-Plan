import React, { useState } from "react";
import {
  CheckCircle,
  Clock,
  TrendingUp,
  Briefcase,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { PageShell } from "../components/layout/PageShell";
import { KPI } from "../components/ui/KPI";
import { Pill } from "../components/ui/Pill";
import { ChartTip } from "../components/ui/ChartTip";
import { display, mono } from "../lib/utils";
import { AREA_DATA, SRC_DATA, FUNNEL, ROLE_PIE } from "../data/shared";

export function AnalyticsView() {
  const [tab, setTab] = useState("overview");

  return (
    <PageShell>
      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 w-fit mb-6 scroll-row">
        {["overview", "sources", "funnel", "velocity"].map((t) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>
            {t}
          </Pill>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI label="Applications YTD" value="47" trend="+18%" sub="vs last year" icon={Briefcase} accent="violet" />
            <KPI label="Response Rate" value="38%" trend="+6pts" icon={CheckCircle} accent="emerald" />
            <KPI label="Interview Rate" value="22%" sub="above avg" icon={TrendingUp} accent="blue" />
            <KPI label="Avg Time to Response" value="4.2d" sub="↓1.3d" icon={Clock} accent="amber" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-1">Application Trend</h3>
              <p className="text-sm text-muted-foreground mb-5">Submissions & responses — Jan to Jun 2026</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={AREA_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis dataKey="m" tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="apps" name="Applied" fill="#6c5ce7" opacity={0.8} radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="responses" name="Responses" stroke="#2dd4bf" strokeWidth={2} dot={{ fill: "#2dd4bf", r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-1">Applications by Role Type</h3>
              <p className="text-sm text-muted-foreground mb-5">Where you're focusing your search</p>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={ROLE_PIE} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="v">
                      {ROLE_PIE.map((e, i) => (
                        <Cell key={i} fill={e.c} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {ROLE_PIE.map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.c }} />
                      <span className="text-sm text-muted-foreground font-semibold">{d.name}</span>
                      <span className="text-sm font-bold text-foreground ml-auto" style={mono}>{d.v}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "sources" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-1">Applications by Source</h3>
            <p className="text-sm text-muted-foreground mb-5">Volume vs responses — channel quality</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={SRC_DATA} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="src" tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#6b6b84", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Bar dataKey="apps" name="Applied" fill="#6c5ce7" opacity={0.7} radius={[4, 4, 0, 0]} />
                <Bar dataKey="responses" name="Responses" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-1">Response Rate by Source</h3>
            <p className="text-sm text-muted-foreground mb-5">Which channels work best for you</p>
            <div className="space-y-5 mt-2">
              {SRC_DATA.sort((a, b) => b.rate - a.rate).map((s) => (
                <div key={s.src}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-foreground">{s.src}</span>
                    <span className="text-sm font-bold text-foreground" style={mono}>{s.rate}%</span>
                  </div>
                  <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(s.rate / 65) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.responses} responses from {s.apps} applications</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "funnel" && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm max-w-2xl">
          <h3 className="text-sm font-bold text-foreground mb-1">Your Application Funnel</h3>
          <p className="text-sm text-muted-foreground mb-6">Conversion through each stage</p>
          <div className="space-y-5">
            {FUNNEL.map((f, i) => (
              <div key={f.s}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground">{f.s}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold text-foreground" style={display}>{f.n}</span>
                    <span className="text-sm text-muted-foreground" style={mono}>{f.p}%</span>
                  </div>
                </div>
                <div className="h-3 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${f.p}%`, opacity: 1 - i * 0.1 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "velocity" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI label="Apps / Week" value="5.2" trend="+0.8" icon={Briefcase} accent="violet" />
          <KPI label="Follow-ups Sent" value="18" sub="this month" icon={TrendingUp} accent="blue" />
          <KPI label="Interviews / Month" value="4.5" sub="on track" icon={CheckCircle} accent="emerald" />
          <KPI label="Offer Rate" value="4.3%" sub="2 of 47 apps" icon={Clock} accent="amber" />
        </div>
      )}
    </PageShell>
  );
}
