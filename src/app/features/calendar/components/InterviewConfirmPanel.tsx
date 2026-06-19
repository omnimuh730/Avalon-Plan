import React, { useState } from "react";
import { X, Check, Clock } from "lucide-react";
import { cn } from "../../../lib/utils";
import { formatTimeRange, type CalendarEvent } from "../../../data/calendar";

type InterviewConfirmPanelProps = {
  event: CalendarEvent | null;
  onClose: () => void;
  onConfirm: (id: string, confirmed: boolean) => void;
};

export function InterviewConfirmPanel({ event, onClose, onConfirm }: InterviewConfirmPanelProps) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  if (!event) return null;

  const startDefault = new Date(event.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const endDefault = new Date(event.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border shadow-xl z-30 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-base font-bold text-foreground">Interview details</h3>
        <button type="button" onClick={onClose} className="icon-btn text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-5 space-y-4 subtle-scroll">
        <div>
          <p className="text-lg font-bold text-foreground">{event.title}</p>
          {event.company && <p className="text-sm text-muted-foreground mt-1">{event.company}</p>}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          {formatTimeRange(event.start, event.end)}
        </div>
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm font-semibold",
            event.confirmed ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}
        >
          {event.confirmed ? "Confirmed" : "Pending confirmation"}
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Start time</span>
            <input
              type="time"
              defaultValue={startTime || startDefault}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1.5 w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/40 min-h-10"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">End time</span>
            <input
              type="time"
              defaultValue={endTime || endDefault}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1.5 w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary/40 min-h-10"
            />
          </label>
        </div>
      </div>
      <div className="p-5 border-t border-border flex gap-2">
        <button
          type="button"
          onClick={() => onConfirm(event.id, true)}
          className="flex-1 flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 min-h-10"
        >
          <Check className="w-4 h-4" />
          Confirm time
        </button>
        <button
          type="button"
          onClick={() => onConfirm(event.id, false)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-secondary min-h-10"
        >
          Mark pending
        </button>
      </div>
    </div>
  );
}
