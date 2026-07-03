import React, { useMemo } from "react";
import { ScanSearch } from "lucide-react";
import { cn } from "../../../lib/utils";

type AiSkill = { name: string; category: string; requirement: number };

const CATEGORY_META: Record<string, { label: string; chip: string }> = {
  hard: { label: "Hard", chip: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  devops: { label: "DevOps", chip: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  tools: { label: "Tools", chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  domain: { label: "Domain", chip: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  soft: { label: "Soft", chip: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
};

const REQ_LABEL: Record<number, string> = {
  5: "Must-have",
  4: "Expected",
  3: "Relevant",
  2: "Nice-to-have",
  1: "Mentioned",
};

/**
 * Shows the skills the AI detected in the job description, with each skill's
 * category and requirement (1–5 = how mandatory). Sorted most-required first.
 */
export function DetectedSkillsPanel({ aiSkills }: { aiSkills?: AiSkill[] }) {
  const sorted = useMemo(
    () => (aiSkills ? [...aiSkills].sort((a, b) => b.requirement - a.requirement) : []),
    [aiSkills],
  );

  if (!sorted.length) return null;

  return (
    <section className="border-t border-border/60 pt-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10">
          <ScanSearch className="size-4 text-primary" />
        </span>
        <h3 className="text-sm font-bold text-foreground">Detected skills</h3>
        <span className="text-xs text-muted-foreground">{sorted.length} found by AI</span>
      </div>
      <div className="space-y-1.5">
        {sorted.map((s) => {
          const meta = CATEGORY_META[s.category] ?? CATEGORY_META.hard;
          return (
            <div
              key={`${s.name}-${s.category}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/20 px-3 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-foreground truncate">{s.name}</span>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold", meta.chip)}>
                  {meta.label}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground w-20 text-right">{REQ_LABEL[s.requirement]}</span>
                <div className="flex gap-0.5" title={`Requirement ${s.requirement}/5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        n <= s.requirement ? "bg-primary" : "bg-border",
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
