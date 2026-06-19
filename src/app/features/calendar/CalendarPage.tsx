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

  const handleConfirm = (id: string, confirmed: boolean) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, confirmed } : e)));
    setSelected((s) => (s?.id === id ? { ...s, confirmed } : s));
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden relative">
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
      <InterviewConfirmPanel
        event={selected}
        onClose={() => setSelected(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
