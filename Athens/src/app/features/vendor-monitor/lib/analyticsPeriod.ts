import type { DateRange } from "../../../hooks/useAnalyticsFilters";
import { rangeToIsoDates } from "../../analytics/lib/dateRange";

export type PeriodMode = "preset" | "custom";

export type AnalyticsPeriod = {
  mode: PeriodMode;
  /** Preset key when mode is preset; ignored for custom. */
  range: DateRange;
  /** Local calendar date YYYY-MM-DD */
  dateFrom: string;
  dateTo: string;
  /** Local time HH:mm */
  timeFrom: string;
  timeTo: string;
};

export type ResolvedAnalyticsPeriod = {
  sinceIso: string;
  untilIso: string;
  label: string;
  /** Prefer hourly buckets when the window is short. */
  preferHourly: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date as local YYYY-MM-DD. */
export function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Format a Date as local HH:mm. */
export function toLocalTimeInput(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parse local date + time into a Date (browser timezone). */
export function localDateTime(date: string, time: string, fallbackTime: string): Date | null {
  const rawDate = String(date ?? "").trim();
  if (!rawDate) return null;
  const rawTime = String(time ?? "").trim() || fallbackTime;
  const normalized = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
  const d = new Date(`${rawDate}T${normalized}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function defaultAnalyticsPeriod(range: DateRange = "30d"): AnalyticsPeriod {
  const { startDate, endDate } = rangeToIsoDates(range);
  const start = new Date(startDate);
  const end = new Date(endDate);
  return {
    mode: "preset",
    range,
    dateFrom: toLocalDateInput(start),
    dateTo: toLocalDateInput(end),
    timeFrom: "00:00",
    timeTo: "23:59",
  };
}

export function periodFromPreset(range: DateRange): AnalyticsPeriod {
  return defaultAnalyticsPeriod(range);
}

export function resolveAnalyticsPeriod(period: AnalyticsPeriod): ResolvedAnalyticsPeriod | null {
  if (period.mode === "preset") {
    const { startDate, endDate } = rangeToIsoDates(period.range);
    const start = new Date(startDate);
    const end = new Date(endDate);
    const labelMap: Record<DateRange, string> = {
      "7d": "last 7 days",
      "30d": "last 30 days",
      "90d": "last 90 days",
      ytd: "year to date",
    };
    return {
      sinceIso: startDate,
      untilIso: endDate,
      label: labelMap[period.range],
      preferHourly: end.getTime() - start.getTime() <= 36 * 60 * 60 * 1000,
    };
  }

  const start = localDateTime(period.dateFrom, period.timeFrom, "00:00:00");
  const end = localDateTime(period.dateTo, period.timeTo, "23:59:59");
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) return null;

  // Make end inclusive through the selected minute.
  const until = new Date(end);
  if ((period.timeTo || "23:59").length <= 5) {
    until.setSeconds(59, 999);
  }

  const sameDay = toLocalDateInput(start) === toLocalDateInput(until);
  const label = sameDay
    ? `${start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${toLocalTimeInput(start)}–${toLocalTimeInput(until)}`
    : `${start.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} → ${until.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;

  return {
    sinceIso: start.toISOString(),
    untilIso: until.toISOString(),
    label,
    preferHourly: until.getTime() - start.getTime() <= 36 * 60 * 60 * 1000,
  };
}
