import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Wand2,
  Share2,
  Archive,
  Send,
  Paperclip,
  ChevronRight,
} from "lucide-react";
import { Av } from "../components/ui/Av";
import { cn, mono } from "../lib/utils";
import { INIT_MSGS } from "../data/agents";
import { APPLICATIONS } from "../data/applications";
import type { Msg } from "../types";

export function CareerCopilot() {
  const [msgs, setMsgs] = useState<Msg[]>(INIT_MSGS);
  const [inp, setInp] = useState("");
  const [typing, setTyping] = useState(false);
  const [conv, setConv] = useState(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  const send = () => {
    if (!inp.trim() || typing) return;
    setMsgs((p) => [...p, { id: Date.now().toString(), role: "user", content: inp, ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]);
    setInp("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((p) => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: "ai",
          ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          content:
            "I've processed your request. I can tailor your resume, draft follow-up emails, find matching roles, or prep you for upcoming interviews. What would you like to do next?",
        },
      ]);
    }, 1800);
  };

  const CHIPS = [
    "Find roles matching my profile",
    "Tailor resume for Vercel role",
    "Draft follow-up for top 5 apps",
    "Prep me for Notion interview",
  ];

  const CONVS = [
    "Role search — React/TS",
    "Resume tailoring",
    "Follow-up drafts",
    "Notion interview prep",
    "Offer negotiation",
  ];

  const renderMsg = (content: string) =>
    content.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <p key={i} className={i > 0 && line ? "mt-2" : i > 0 ? "mt-1" : ""}>
          {parts.map((pt, j) =>
            pt.startsWith("**") && pt.endsWith("**") ? (
              <strong key={j} className="font-bold text-foreground">{pt.slice(2, -2)}</strong>
            ) : (
              pt
            )
          )}
        </p>
      );
    });

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-52 border-r border-border flex flex-col flex-shrink-0 bg-secondary/30">
        <div className="p-4 border-b border-border">
          <button className="w-full flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors min-h-10">
            <Plus className="w-4 h-4" />
            New chat
          </button>
        </div>
        <div className="flex-1 p-3 space-y-1 overflow-y-auto subtle-scroll">
          {CONVS.map((c, i) => (
            <button
              key={c}
              onClick={() => setConv(i)}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors truncate min-h-10",
                conv === i ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-border flex items-center gap-4 flex-shrink-0 bg-card/50">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Career Copilot</p>
            <p className="text-xs text-emerald-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Online · Claude 3.5 + GPT-4o
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-semibold min-h-10">
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-semibold min-h-10">
              <Archive className="w-4 h-4" />
              Archive
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 subtle-scroll">
          {msgs.map((m) => (
            <div key={m.id} className={cn("flex gap-4", m.role === "user" ? "flex-row-reverse" : "")}>
              {m.role === "ai" ? (
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Wand2 className="w-5 h-5 text-primary" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 text-white text-sm font-bold">
                  JD
                </div>
              )}
              <div className={cn("max-w-[560px] min-w-0")}>
                <div
                  className={cn(
                    "rounded-xl px-5 py-4 text-sm leading-relaxed",
                    m.role === "ai"
                      ? "bg-card border border-border text-foreground/85 shadow-sm"
                      : "bg-primary text-white shadow-sm"
                  )}
                >
                  {renderMsg(m.content)}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 px-1" style={mono}>{m.ts}</p>
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Wand2 className="w-5 h-5 text-primary" />
              </div>
              <div className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm">
                <div className="flex gap-1.5 items-center h-5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={end} />
        </div>

        <div className="px-6 py-3 scroll-row flex-shrink-0 border-t border-border/50">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => setInp(c)}
              className="text-sm font-semibold px-4 py-2 bg-secondary border border-border rounded-full text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors min-h-10"
            >
              {c}
            </button>
          ))}
        </div>

        <div className="p-5 border-t border-border flex-shrink-0">
          <div className="flex items-end gap-3 bg-secondary border border-border rounded-xl px-5 py-3 focus-within:border-primary/40 transition-colors">
            <textarea
              value={inp}
              onChange={(e) => setInp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask Copilot about your job search..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground resize-none outline-none leading-relaxed min-h-[24px] max-h-32"
              rows={1}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              <button className="icon-btn text-muted-foreground hover:text-foreground w-10 h-10">
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                onClick={send}
                disabled={!inp.trim() || typing}
                className="icon-btn bg-primary text-white hover:bg-primary/90 disabled:opacity-30 shadow-sm"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Copilot can make mistakes. Verify important details before applying or sending messages.
          </p>
        </div>
      </div>

      <div className="w-60 border-l border-border flex-shrink-0 overflow-y-auto p-5 space-y-5 bg-secondary/20 subtle-scroll">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Target Role</p>
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <p className="text-sm font-bold text-foreground">Senior Frontend Engineer</p>
            <p className="text-sm text-muted-foreground">Vercel · Remote</p>
            <p className="text-xs text-muted-foreground mt-1">94% match · $160k–$200k</p>
            <div className="mt-3 h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full w-[94%] bg-primary rounded-full" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Strong fit — apply soon</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Top Applications</p>
          <div className="bg-card border border-border rounded-xl p-4 space-y-3 shadow-sm">
            {APPLICATIONS.filter((c) => ["a01", "a09", "a10"].includes(c.id)).map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <Av name={c.company} size="xs" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{c.company}</p>
                  <p className="text-xs text-muted-foreground" style={mono}>{c.score}% match</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
          <div className="space-y-1">
            {["Tailor resume", "Draft cover letter", "Follow-up email", "Interview prep", "Compare offers"].map((a) => (
              <button key={a} className="w-full text-left text-sm font-semibold text-muted-foreground hover:text-foreground flex items-center gap-2 py-2.5 px-3 rounded-xl hover:bg-secondary transition-colors min-h-10">
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
                {a}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Workflow</p>
          <div className="space-y-2">
            {[
              { n: "Auto-tailor resume", on: true },
              { n: "Follow-up seq.", on: true },
              { n: "Calendar sync", on: false },
            ].map((w) => (
              <div key={w.n} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-semibold">{w.n}</span>
                <div className={cn("w-10 h-5 rounded-full flex items-center transition-colors", w.on ? "bg-primary" : "bg-secondary border border-border")}>
                  <div className={cn("w-4 h-4 rounded-full bg-white transition-transform mx-0.5 shadow-sm", w.on ? "translate-x-5" : "")} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
