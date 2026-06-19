import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn, display } from "../lib/utils";
import { CAL_EVENTS } from "../data/shared";

export function CalendarView() {
  const [cur, setCur] = useState(new Date(2026, 5, 1));
  const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1).getDay();
  const label = cur.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <h2 className="text-xl font-bold text-foreground" style={display}>
          {label}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() - 1, 1))}
            className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCur(new Date(2026, 5, 1))}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors min-h-10"
          >
            Today
          </button>
          <button
            onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() + 1, 1))}
            className="icon-btn text-muted-foreground hover:text-foreground hover:bg-secondary border border-border"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors min-h-10 ml-2">
            <Plus className="w-4 h-4" />
            Add Event
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col border border-border rounded-xl overflow-hidden shadow-sm bg-card">
        <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="py-3 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider bg-secondary/30"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="flex-1 overflow-auto grid grid-cols-7 auto-rows-fr subtle-scroll">
          {Array.from({ length: first }).map((_, i) => (
            <div key={`e${i}`} className="border-r border-b border-border bg-secondary/20 min-h-[100px]" />
          ))}
          {Array.from({ length: dim }).map((_, i) => {
            const day = i + 1;
            const evts = CAL_EVENTS[day] || [];
            const isToday = day === 19 && cur.getMonth() === 5;
            return (
              <div
                key={day}
                className="border-r border-b border-border p-2 min-h-[100px] hover:bg-secondary/20 transition-colors cursor-pointer"
              >
                <span
                  className={cn(
                    "inline-flex w-8 h-8 items-center justify-center rounded-full text-sm font-bold mb-1",
                    isToday ? "bg-primary text-white shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {day}
                </span>
                <div className="space-y-1">
                  {evts.map((e, j) => (
                    <div key={j} className={cn("text-xs px-2 py-1 rounded font-semibold truncate", e.c)}>
                      {e.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
