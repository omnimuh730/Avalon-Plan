import React, { useState } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import { KPI } from "../../../components/ui";
import { cn } from "../../../lib/utils";
import { RESUME_STACKS } from "../../../data/resumes";
import { Layers, Sparkles, BarChart3 } from "lucide-react";

export function ResumeAnalysisTab() {
  const [featured, setFeatured] = useState(RESUME_STACKS[0]);
  const totalSkills = RESUME_STACKS.reduce((s, st) => s + st.skills, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPI label="Stacks" value={String(RESUME_STACKS.length)} icon={Layers} accent="violet" />
        <KPI label="Skill entries" value={String(totalSkills)} icon={BarChart3} accent="blue" />
        <KPI label="Avg skills / stack" value={(totalSkills / RESUME_STACKS.length).toFixed(1)} icon={Sparkles} accent="emerald" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-4">{featured.name}</h3>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={featured.radar}>
              <PolarGrid stroke="rgba(0,0,0,0.08)" />
              <PolarAngleAxis dataKey="skill" tick={{ fill: "#6b6b84", fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
              <Radar dataKey="v" stroke={featured.color} fill={featured.color} fillOpacity={0.35} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {RESUME_STACKS.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setFeatured(st)}
              className={cn(
                "bg-card border rounded-xl p-4 text-left transition-all shadow-sm",
                featured.id === st.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:shadow-md",
              )}
            >
              <ResponsiveContainer width="100%" height={80}>
                <RadarChart data={st.radar}>
                  <Radar dataKey="v" stroke={st.color} fill={st.color} fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
              <p className="text-xs font-bold text-foreground mt-2 truncate">{st.name}</p>
              <p className="text-[10px] text-muted-foreground">{st.skills} skills</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
