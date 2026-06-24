import { Sparkles } from "lucide-react";
import { ResumeRadarChart } from "./ResumeRadarChart";
import { skillRadarData } from "../../generator/history/skill-profile-utils";
import type { UseSkillGraphResult } from "../../../knowledge-graph/hooks/useSkillGraph";

type ResumeSkillAnalysisViewProps = {
  graph: UseSkillGraphResult;
  title?: string;
  description?: string;
};

export function ResumeSkillAnalysisView({
  graph,
  title,
  description,
}: ResumeSkillAnalysisViewProps) {
  const { skillStrengthList, loading, error } = graph;

  const skills = skillStrengthList.map((s) => ({
    name: s.label,
    strength: s.strength,
  }));

  const radarData = skillRadarData(skills);

  if (loading && !skills.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Sparkles className="w-5 h-5 animate-pulse text-primary" />
        Loading skill analysis…
      </div>
    );
  }

  if (error && !skills.length) {
    return (
      <div className="flex items-center justify-center h-full text-destructive text-sm px-8 text-center">
        {error}
      </div>
    );
  }

  if (!skills.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
        <Sparkles className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-sm font-semibold text-foreground">No skills extracted yet</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Re-run Analyze on this resume from the Library tab to extract skills and strength scores.
        </p>
      </div>
    );
  }

  const avgStrength = skills.reduce((sum, s) => sum + s.strength, 0) / skills.length;
  const topSkill = [...skills].sort((a, b) => b.strength - a.strength)[0];

  return (
    <div className="h-full overflow-y-auto subtle-scroll p-6 space-y-5">
      {title ? (
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {title}
          </h2>
          {description ? (
            <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">{description}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Skills tracked", value: skills.length.toLocaleString() },
          { label: "Avg strength", value: avgStrength.toFixed(1) },
          { label: "Top skill", value: topSkill?.name ?? "—" },
        ].map((row) => (
          <div key={row.label} className="rounded-xl border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{row.label}</div>
            <div className="text-sm font-semibold text-foreground mt-1 truncate" title={row.value}>
              {row.value}
            </div>
          </div>
        ))}
      </div>

      {radarData.length >= 3 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-foreground">Skill strength radar</h4>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Top {radarData.length} · 0–10 scale
            </span>
          </div>
          <ResumeRadarChart
            data={radarData}
            series={[{ key: "strength", label: "Strength", color: "#6c5ce7" }]}
            height={340}
            domain={[0, 100]}
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="text-sm font-semibold text-foreground">Weighted skills</h4>
        </div>
        <ul className="space-y-2 max-h-[420px] overflow-y-auto subtle-scroll pr-1">
          {[...skills]
            .sort((a, b) => b.strength - a.strength)
            .map((s) => (
              <li key={s.name}>
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-xs font-semibold text-foreground truncate">{s.name}</span>
                  <span className="text-xs font-mono text-primary shrink-0 tabular-nums">
                    {s.strength.toFixed(1)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((s.strength / 10) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
