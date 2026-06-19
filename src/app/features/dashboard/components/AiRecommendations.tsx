import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "../../../lib/utils";
import { AI_RECS } from "../../../data/dashboard";

export function AiRecommendations() {
  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <h3 className="text-sm font-bold text-foreground flex-1">AI Recommendations</h3>
        <Sparkles className="w-5 h-5 text-violet-600" />
      </div>
      <div className="space-y-3">
        {AI_RECS.map((r, i) => (
          <div key={i} className="border border-border rounded-xl p-4 hover:shadow-sm transition-all cursor-pointer group">
            <p className="text-sm text-foreground/75 leading-relaxed mb-2">{r.t}</p>
            <span className={cn("text-sm font-bold group-hover:underline", r.c)}>{r.a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
