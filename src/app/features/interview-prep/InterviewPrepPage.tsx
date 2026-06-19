import React, { useState } from "react";
import { CheckCircle } from "lucide-react";
import { PageShell } from "../../components/layout/PageShell";
import { Pill, Badge, Score } from "../../components/ui";
import { QUESTIONS, DIFFICULTY_VARIANTS, PREP_PLANS, SCORECARDS } from "../../data/interview";

export function InterviewPrepPage() {
  const [tab, setTab] = useState("plans");

  return (
    <PageShell>
      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 w-fit mb-6">
        {["plans", "questions", "scorecards"].map((t) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>{t}</Pill>
        ))}
      </div>
      {tab === "questions" && (
        <div className="space-y-4">
          {QUESTIONS.map((q, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all shadow-sm">
              <div className="flex items-center gap-2 mb-3"><Badge v="subtle">{q.cat}</Badge><Badge v={DIFFICULTY_VARIANTS[q.diff]}>{q.diff}</Badge></div>
              <p className="text-sm text-foreground/85 leading-relaxed">{q.q}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "plans" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {PREP_PLANS.map((item) => (
            <div key={item.role} className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-foreground mb-1">{item.role}</h3>
              <p className="text-sm text-muted-foreground mb-4">{item.rounds} rounds · AI prep enabled · Next: {item.next}</p>
              <div className="space-y-2.5">
                {["Research company & role", "Review common questions", "Mock technical session", "Behavioral prep"].map((r) => (
                  <div key={r} className="flex items-center gap-3 text-sm"><CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" /><span className="text-foreground/80 font-semibold">{r}</span></div>
                ))}
              </div>
              <button type="button" className="mt-5 text-sm text-primary font-bold hover:underline min-h-10">Start Prep Session →</button>
            </div>
          ))}
        </div>
      )}
      {tab === "scorecards" && (
        <div className="space-y-4">
          {SCORECARDS.map((c) => (
            <div key={c.company} className="bg-card border border-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">{c.company[0]}</div>
                <div className="flex-1"><p className="text-base font-bold text-foreground">{c.role}</p><p className="text-sm text-muted-foreground">{c.company}</p></div>
                <Score score={c.overall} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {c.scores.map(([d, v]) => (
                  <div key={d} className="text-center bg-secondary rounded-xl p-4"><div className="text-xl font-bold text-foreground">{v}</div><div className="text-xs text-muted-foreground mt-1 font-semibold">{d}</div></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
