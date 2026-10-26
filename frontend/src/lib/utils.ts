import {
  addDays,
  differenceInMinutes,
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfWeek,
} from "date-fns";
import type { Clash, DayCode, ScheduleEvent, Settings } from "../types";

export const DAYS: DayCode[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const JS_DAY: DayCode[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayForDate(date: Date): DayCode {
  return JS_DAY[date.getDay()];
}

export function timeToMinutes(value: string | null | undefined): number {
  if (!value) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes || 0, 0, 0);
  return format(date, "h:mm a");
}

export function timeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function weekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function eventColor(event: ScheduleEvent, clashes: Clash[] = []): {
  bg: string;
  border: string;
  text: string;
  dot: string;
} {
  const hasClash = clashes.some(
    (clash) => clash.event_a_id === event.id || clash.event_b_id === event.id,
  );
  if (hasClash) {
    return { bg: "bg-coral-50", border: "border-coral-400", text: "text-[#B23B2A]", dot: "bg-coral-500" };
  }
  if (event.event_type === "exam") {
    return { bg: "bg-amber-50", border: "border-amber-500", text: "text-[#8F5A10]", dot: "bg-amber-500" };
  }
  if (event.event_type === "lab") {
    return { bg: "bg-teal-50", border: "border-teal-500", text: "text-teal-600", dot: "bg-teal-500" };
  }
  if (event.is_core) {
    return { bg: "bg-[#EDF4E4]", border: "border-[#8DB95A]", text: "text-[#3E6025]", dot: "bg-[#7CAD45]" };
  }
  return { bg: "bg-ink-50", border: "border-ink-300", text: "text-ink-600", dot: "bg-ink-400" };
}

export function occursOn(event: ScheduleEvent, date: Date, settings: Settings): boolean {
  if (event.event_date) {
    return isSameDay(parseISO(event.event_date), date);
  }
  if (!event.days?.includes(dayForDate(date))) return false;
  const termStart = parseISO(settings.termStart);
  const termEnd = parseISO(settings.termEnd);
  if (!isWithinInterval(date, { start: termStart, end: termEnd })) return false;
  const holidayDates = (settings.holidays || []).map((holiday) => holiday.date);
  if (holidayDates.includes(format(date, "yyyy-MM-dd"))) return false;
  if (settings.readingWeekStart && settings.readingWeekEnd) {
    if (
      isWithinInterval(date, {
        start: parseISO(settings.readingWeekStart),
        end: parseISO(settings.readingWeekEnd),
      })
    ) {
      return false;
    }
  }
  return true;
}

export function eventsOn(events: ScheduleEvent[], date: Date, settings: Settings): ScheduleEvent[] {
  return events
    .filter((event) => occursOn(event, date, settings))
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
}

export function nextClass(events: ScheduleEvent[], settings: Settings): { event: ScheduleEvent; date: Date } | null {
  const now = new Date();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = addDays(now, offset);
    const candidates = eventsOn(events, date, settings).filter((event) => {
      if (event.event_date) return true;
      if (offset === 0) return timeToMinutes(event.end_time) > now.getHours() * 60 + now.getMinutes();
      return true;
    });
    if (candidates.length) return { event: candidates[0], date };
  }
  return null;
}

export function readinessTone(value: number): { ring: string; text: string; label: string } {
  if (value >= 90) return { ring: "#AEDC47", text: "text-teal-600", label: "Ready to sync" };
  if (value >= 45) return { ring: "#D99A2B", text: "text-amber-600", label: "In review" };
  return { ring: "#DF5D48", text: "text-coral-600", label: "Needs review" };
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function shortDate(value: string): string {
  return format(parseISO(value), "MMM d");
}

export function relativeTime(value: string): string {
  const date = new Date(value);
  const diff = differenceInMinutes(new Date(), date);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / (60 * 24))}d ago`;
}

export function formatDateRange(start: string, end: string): string {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (startDate.getFullYear() !== endDate.getFullYear()) {
    return `${format(startDate, "MMM d, yyyy")} – ${format(endDate, "MMM d, yyyy")}`;
  }
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, "MMM d")} – ${format(endDate, "d, yyyy")}`;
  }
  return `${format(startDate, "MMM d")} – ${format(endDate, "MMM d, yyyy")}`;
}

export function eventSubtitle(event: ScheduleEvent): string {
  if (event.event_date) return `${format(parseISO(event.event_date), "EEE, MMM d")} · ${timeRange(event.start_time, event.end_time)}`;
  return `${event.days.join(", ")} · ${timeRange(event.start_time, event.end_time)}`;
}
