import React, { useMemo, useState } from "react";
import { CalendarHeader } from "./components/CalendarHeader";
import { MonthGrid } from "./components/MonthGrid";
import { WeekTimeGrid } from "./components/WeekTimeGrid";
import { InterviewConfirmPanel } from "./components/InterviewConfirmPanel";
import { CALENDAR_EVENTS, eventsInWeek, type CalendarEvent } from "../../data/calendar";

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

export function CalendarPage() {
  const today = useMemo(() => new Date(2026, 5, 18), []);
  const [cur, setCur] = useState(new Date(2026, 5, 1));
  const [view, setView] = useState<"month" | "week">("month");
  const [events, setEvents] = useState(CALENDAR_EVENTS);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const weekStart = startOfWeek(view === "week" ? cur : today);
  const label =
    view === "month"
      ? cur.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const weekEvents = eventsInWeek(weekStart, events);

  const handleConfirm = (id: string, confirmed: boolean, times?: { start: string; end: string }) => {
    setEvents((prev) => {
      const next = prev.map((e) => {
        if (e.id !== id) return e;
        let start = e.start;
        let end = e.end;
        if (times?.start && times?.end) {
          const base = new Date(e.start);
          const [sh, sm] = times.start.split(":").map(Number);
          const [eh, em] = times.end.split(":").map(Number);
          const ns = new Date(base);
          ns.setHours(sh, sm, 0, 0);
          const ne = new Date(base);
          ne.setHours(eh, em, 0, 0);
          start = ns.toISOString();
          end = ne.toISOString();
        }
        return { ...e, confirmed, start, end };
      });
      setSelected((s) => {
        if (s?.id !== id) return s;
        return next.find((e) => e.id === id) ?? s;
      });
      return next;
    });
  };

  return (
    <div
      className="h-full flex flex-col p-6 overflow-hidden relative"
      onClick={() => setSelected(null)}
    >
      <CalendarHeader
        label={label}
        view={view}
        onViewChange={setView}
        onPrev={() =>
          setCur(
            view === "month"
              ? new Date(cur.getFullYear(), cur.getMonth() - 1, 1)
              : new Date(cur.getTime() - 7 * 86400000),
          )
        }
        onNext={() =>
          setCur(
            view === "month"
              ? new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
              : new Date(cur.getTime() + 7 * 86400000),
          )
        }
        onToday={() => setCur(new Date(today))}
      />
      <div onClick={(e) => e.stopPropagation()}>
        {view === "month" ? (
          <MonthGrid cur={cur} today={today} events={events} onEventClick={setSelected} />
        ) : (
          <WeekTimeGrid
            weekStart={weekStart}
            events={weekEvents}
            today={today}
            onEventClick={setSelected}
          />
        )}
      </div>
      <InterviewConfirmPanel
        event={selected}
        onClose={() => setSelected(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
