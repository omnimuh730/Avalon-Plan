import { Check, Sparkles, X } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { Job } from "../../../types";

type RequiredSkillsMatchProps = {
  job: Job;
};

function scoreBreakdown(job: Job): string | null {
  const { skillsCovered, skillsRequired, skill, vector } = job.scores;
  if (!skillsRequired) return null;

  const parts: string[] = [
    `${skillsCovered ?? 0}/${skillsRequired} required skills in your profile`,
    `${skill}% skill match`,
  ];
  if (vector != null && vector > 0) {
    parts.push(`${vector}% profile similarity`);
  }
  return parts.join(" · ");
}

export function RequiredSkillsMatch({ job }: RequiredSkillsMatchProps) {
  if (!job.skills.length) return null;

  const highlightMap = new Map(
    (job.skillHighlights ?? []).map((row) => [row.name.toLowerCase(), row.matched]),
  );
  const hasHighlights = highlightMap.size > 0;
  const breakdown = scoreBreakdown(job);

  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground">Required skills</h3>
      </div>
      {breakdown ? (
        <p className="mb-3 text-xs text-muted-foreground">{breakdown}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {job.skills.map((skill) => {
          const matched = hasHighlights ? highlightMap.get(skill.toLowerCase()) : undefined;
          const isMatched = matched === true;
          const isMissing = matched === false;

          return (
            <span
              key={skill}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold tracking-wide border",
                isMatched && "bg-emerald-50 text-emerald-800 border-emerald-300",
                isMissing && "bg-secondary/60 text-muted-foreground border-border/80 opacity-80",
                !isMatched && !isMissing && "bg-violet-50 text-violet-700 border-violet-200",
              )}
              title={
                isMatched
                  ? "In your profile — counts toward skill match"
                  : isMissing
                    ? "Not in your profile — lowers skill match"
                    : undefined
              }
            >
              {isMatched ? <Check className="size-3 shrink-0" aria-hidden /> : null}
              {isMissing ? <X className="size-3 shrink-0 opacity-60" aria-hidden /> : null}
              {skill}
            </span>
          );
        })}
      </div>
      {hasHighlights ? (
        <p className="mt-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 mr-3">
            <span className="inline-block size-2 rounded-sm bg-emerald-400" aria-hidden />
            In your profile
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-border" aria-hidden />
            Missing from profile
          </span>
        </p>
      ) : null}
    </section>
  );
}
