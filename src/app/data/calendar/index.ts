export type CalendarEventType = "interview" | "deadline" | "followup";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: CalendarEventType;
  company?: string;
  confirmed?: boolean;
}

export const EVENT_COLORS: Record<CalendarEventType, string> = {
  interview: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-l-violet-500",
  deadline: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-l-blue-500",
  followup: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-l-amber-500",
};

export const CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: "e1",
    title: "Notion PM Interview",
    start: "2026-06-19T14:00:00",
    end: "2026-06-19T15:00:00",
    type: "interview",
    company: "Notion",
    confirmed: true,
  },
  {
    id: "e2",
    title: "Stripe Assessment Due",
    start: "2026-06-20T23:59:00",
    end: "2026-06-20T23:59:00",
    type: "deadline",
    company: "Stripe",
    confirmed: true,
  },
  {
    id: "e3",
    title: "Meta Offer Call",
    start: "2026-06-22T10:00:00",
    end: "2026-06-22T11:00:00",
    type: "interview",
    company: "Meta",
    confirmed: false,
  },
  {
    id: "e4",
    title: "Follow-up: Linear",
    start: "2026-06-22T15:00:00",
    end: "2026-06-22T15:30:00",
    type: "followup",
    company: "Linear",
    confirmed: true,
  },
  {
    id: "e5",
    title: "Anthropic Tech Interview",
    start: "2026-06-25T11:00:00",
    end: "2026-06-25T12:30:00",
    type: "interview",
    company: "Anthropic",
    confirmed: false,
  },
  {
    id: "e6",
    title: "Job Scout Weekly Review",
    start: "2026-06-26T09:00:00",
    end: "2026-06-26T09:30:00",
    type: "followup",
    confirmed: true,
  },
  {
    id: "e7",
    title: "GitHub Phone Screen",
    start: "2026-06-30T13:00:00",
    end: "2026-06-30T13:45:00",
    type: "interview",
    company: "GitHub",
    confirmed: false,
  },
  {
    id: "e8",
    title: "Baseten Virtual Coding",
    start: "2026-06-18T10:00:00",
    end: "2026-06-18T11:00:00",
    type: "interview",
    company: "Baseten",
    confirmed: true,
  },
  {
    id: "e9",
    title: "CVS Health Phone Screen",
    start: "2026-06-16T08:00:00",
    end: "2026-06-16T09:00:00",
    type: "interview",
    company: "CVS Health",
    confirmed: true,
  },
  {
    id: "e10",
    title: "Glean Intro Call",
    start: "2026-06-17T12:00:00",
    end: "2026-06-17T12:30:00",
    type: "interview",
    company: "Glean",
    confirmed: true,
  },
];

/** Legacy day-keyed map for month chips */
export function eventsByDay(
  month: number,
  year: number,
  source: CalendarEvent[] = CALENDAR_EVENTS,
): Record<number, CalendarEvent[]> {
  const map: Record<number, CalendarEvent[]> = {};
  source.forEach((e) => {
    const d = new Date(e.start);
    if (d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate();
      if (!map[day]) map[day] = [];
      map[day].push(e);
    }
  });
  return map;
}

export function eventsInWeek(weekStart: Date, source: CalendarEvent[] = CALENDAR_EVENTS): CalendarEvent[] {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return source.filter((e) => {
    const s = new Date(e.start);
    return s >= weekStart && s < end;
  });
}

export function formatTimeRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${fmt(start)}–${fmt(end)}`;
}

/** @deprecated use CALENDAR_EVENTS */
export const CAL_EVENTS: Record<number, { title: string; c: string }[]> = {};
