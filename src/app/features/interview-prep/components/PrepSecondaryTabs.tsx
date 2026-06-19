import React from "react";
import { Badge, Score } from "../../../components/ui";
import { QUESTIONS, DIFFICULTY_VARIANTS, SCORECARDS } from "../../../data/interview";

export function PrepQuestionBankTab() {
  return (
    <div className="p-5 space-y-4 overflow-auto subtle-scroll">
      {QUESTIONS.map((q, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Badge v="subtle">{q.cat}</Badge>
            <Badge v={DIFFICULTY_VARIANTS[q.diff]}>{q.diff}</Badge>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed">{q.q}</p>
        </div>
      ))}
    </div>
  );
}

export function PrepScorecardsTab() {
  return (
    <div className="p-5 space-y-4 overflow-auto subtle-scroll">
      {SCORECARDS.map((c) => (
        <div key={c.company} className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {c.company[0]}
            </div>
            <div className="flex-1">
              <p className="text-base font-bold text-foreground">{c.role}</p>
              <p className="text-sm text-muted-foreground">{c.company}</p>
            </div>
            <Score score={c.overall} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {c.scores.map(([d, v]) => (
              <div key={d} className="text-center bg-secondary rounded-xl p-4">
                <div className="text-xl font-bold text-foreground">{v}</div>
                <div className="text-xs text-muted-foreground mt-1 font-semibold">{d}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
