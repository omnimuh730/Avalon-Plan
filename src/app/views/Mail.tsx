import React, { useState } from "react";
import { Search, Send, Sparkles, Archive, Trash2 } from "lucide-react";
import { Av } from "../components/ui/Av";
import { Badge } from "../components/ui/Badge";
import { cn } from "../lib/utils";
import { MAIL_THREADS } from "../data/shared";
import type { BadgeVariant } from "../types";

export function MailView() {
  const [sel, setSel] = useState(MAIL_THREADS[0]);
  const TV: Record<string, BadgeVariant> = {
    Interview: "violet",
    Offer: "success",
    Assessment: "blue",
    Recruiter: "subtle",
  };

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-80 border-r border-border flex flex-col flex-shrink-0 bg-card/30">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-4 py-2.5 focus-within:border-primary/40 transition-colors min-h-10">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              placeholder="Search mail..."
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none flex-1 min-w-0"
            />
          </div>
        </div>
        <div className="flex items-center gap-1 px-4 py-3 border-b border-border">
          {["Inbox", "Sent", "Drafts"].map((t, i) => (
            <button
              key={t}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-semibold transition-colors min-h-10",
                i === 0 ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border/50 subtle-scroll">
          {MAIL_THREADS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSel(t)}
              className={cn(
                "w-full text-left p-4 hover:bg-secondary/50 transition-colors relative",
                sel?.id === t.id ? "bg-primary/5 border-r-2 border-r-primary" : ""
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-sm truncate flex-1 pr-2", t.unread ? "font-bold text-foreground" : "font-semibold text-muted-foreground")}>
                  {t.from}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{t.time}</span>
              </div>
              <p className={cn("text-sm truncate mb-2", t.unread ? "text-foreground/80 font-semibold" : "text-muted-foreground")}>
                {t.subj}
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground truncate flex-1">{t.prev}</p>
                <Badge v={TV[t.tag] ?? "subtle"}>{t.tag}</Badge>
              </div>
              {t.unread && <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-5 border-b border-border flex-shrink-0">
          <h2 className="text-base font-bold text-foreground mb-3">{sel.subj}</h2>
          <div className="flex items-center gap-4">
            <Av name={sel.from} size="sm" />
            <div>
              <p className="text-sm font-bold text-foreground">{sel.from}</p>
              <p className="text-xs text-muted-foreground">to Jordan Doe · {sel.time}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge v={TV[sel.tag] ?? "subtle"}>{sel.tag}</Badge>
              <button className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border">
                <Archive className="w-5 h-5" />
              </button>
              <button className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 subtle-scroll">
          <p className="text-sm text-foreground/85 leading-relaxed">{sel.prev}</p>
          <p className="text-sm text-foreground/85 leading-relaxed mt-4">
            Thank you for your interest in this opportunity. Please let us know if you have any questions about the process or next steps.
          </p>
          <p className="text-sm text-muted-foreground mt-6">
            Best regards,
            <br />
            {sel.from}
          </p>
        </div>

        <div className="border-t border-border p-5 flex-shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <button className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors min-h-10">
              <Send className="w-4 h-4" />
              Reply
            </button>
            <button className="flex items-center gap-2 bg-secondary border border-border text-foreground px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-muted transition-colors min-h-10">
              <Sparkles className="w-4 h-4 text-violet-600" />
              AI Reply
            </button>
            <button className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted transition-colors min-h-10">
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
