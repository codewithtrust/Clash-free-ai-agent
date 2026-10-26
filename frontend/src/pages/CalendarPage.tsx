import { useMemo, useState } from "react";
import { addDays, addWeeks, format, isSameDay, startOfWeek, subWeeks } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {Clash, ScheduleEvent} from "../types";
import { api } from "../lib/api";
import {
  classNames,
  dayForDate,
  eventColor,
  eventsOn,
  formatDateRange,
  formatTime,
  readinessTone,
  timeRange,
  timeToMinutes,
} from "../lib/utils";
import { Badge, Button, Card, EmptyState } from "../components/ui";
import { SyncModal } from "../components/SyncModal";
import { EventModal } from "../components/EventModal";
import { ClashModal } from "../components/ClashModal";

const GRID_START = 8;
const GRID_END = 20;
const HOUR_HEIGHT = 56;

interface LaidOutEvent {
  event: ScheduleEvent;
  lane: number;
  lanes: number;
}

function layoutDay(events: ScheduleEvent[]): LaidOutEvent[] {
  const sorted = [...events].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  const clusters: ScheduleEvent[][] = [];
  let current: ScheduleEvent[] = [];
  let clusterEnd = 0;
  for (const event of sorted) {
    const start = timeToMinutes(event.start_time);
    if (current.length && start >= clusterEnd) {
      clusters.push(current);
      current = [];
    }
    current.push(event);
    clusterEnd = Math.max(clusterEnd, timeToMinutes(event.end_time));
  }
  if (current.length) clusters.push(current);

  return clusters.flatMap((cluster) => {
    const laneEnds: number[] = [];
    const assignment = cluster.map((event) => {
      const start = timeToMinutes(event.start_time);
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(timeToMinutes(event.end_time));
      } else {
        laneEnds[lane] = timeToMinutes(event.end_time);
      }
      return { event, lane };
    });
    return assignment.map((item) => ({ ...item, lanes: laneEnds.length }));
  });
}

export default function CalendarPage() {
  const { data, refresh, toast } = useApp();
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState<"week" | "agenda">("week");
  const [syncOpen, setSyncOpen] = useState(false);
  const [activeEvent, setActiveEvent] = useState<ScheduleEvent | null>(null);
  const [activeClash, setActiveClash] = useState<Clash | null>(null);

  if (!data) return null;
  const { events, clashes, settings } = data;
  const week = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }).map((_, index) => addDays(week, index));
  const weekEvents = days.flatMap((day) => eventsOn(events, day, settings).map((event) => ({ event, date: day })));
  const clashEventIds = new Set(clashes.flatMap((clash) => [clash.event_a_id, clash.event_b_id]));
  const approved = data.sync.approved;
  const tone = readinessTone(data.sync.ready ? 100 : data.summary.readiness);
  const currentTimeTop = ((new Date().getHours() + new Date().getMinutes() / 60 - GRID_START) * HOUR_HEIGHT);

  const download = async () => {
    try {
      await api.downloadIcs();
      await refresh(true);
      toast("Calendar downloaded. Import it into any calendar app.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download calendar.", "error");
    }
  };

  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <div className="stagger">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Schedule canvas</p>
              <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-[-0.045em] text-ink-950 sm:text-[32px]">
                Calendar preview
              </h1>
              <p className="mt-1 max-w-xl text-[13px] leading-6 text-ink-500">
                Recurring classes, reading-week exclusions and one-off exams — exactly as they will appear after sync.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" size="md" onClick={() => void download()} icon={<Download size={14} />}>
                .ics
              </Button>
              <Button size="md" onClick={() => setSyncOpen(true)} icon={<CalendarPlus size={14} />}>
                Sync calendar
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_286px]">
            <Card className="overflow-hidden">
              <div className="flex flex-col justify-between gap-3 border-b border-ink-100 px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAnchor(subWeeks(anchor, 1))}
                    className="rounded-lg border border-ink-200 bg-white p-1.5 text-ink-500 transition hover:bg-ink-50 hover:text-ink-800"
                    aria-label="Previous week"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnchor(new Date())}
                    className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-ink-600 transition hover:bg-ink-50"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnchor(addWeeks(anchor, 1))}
                    className="rounded-lg border border-ink-200 bg-white p-1.5 text-ink-500 transition hover:bg-ink-50 hover:text-ink-800"
                    aria-label="Next week"
                  >
                    <ChevronRight size={15} />
                  </button>
                  <div className="ml-1">
                    <p className="font-display text-[13px] font-bold text-ink-900">
                      {format(week, "MMM d")} – {format(addDays(week, 6), "MMM d, yyyy")}
                    </p>
                    <p className="text-[9px] text-ink-400">{settings.termName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
                    {(["week", "agenda"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setView(item)}
                        className={classNames(
                          "rounded-md px-2.5 py-1 text-[10px] font-semibold capitalize transition",
                          view === item ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-800",
                        )}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <Badge tone="neutral">{weekEvents.length} blocks</Badge>
                </div>
              </div>

              {view === "week" ? (
                <div className="overflow-x-auto">
                  <div className="min-w-[830px]">
                    <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-ink-100 bg-ink-50/40">
                      <div className="px-2 py-2.5 text-[8px] font-bold uppercase tracking-[0.13em] text-ink-500">GMT</div>
                      {days.map((day) => {
                        const holiday = settings.holidays.find((item) => isSameDay(new Date(`${item.date}T00:00:00`), day));
                        const today = isSameDay(day, new Date());
                        return (
                          <div
                            key={day.toISOString()}
                            className={classNames(
                              "border-l border-ink-100 px-2 py-2 text-center",
                              today && "bg-[#F1F8E4]",
                            )}
                          >
                            <p className={classNames("text-[8px] font-bold uppercase tracking-[0.1em]", today ? "text-[#4F7020]" : "text-ink-500")}>
                              {format(day, "EEE")}
                            </p>
                            <div className="mt-0.5 flex items-center justify-center gap-1">
                              <p className={classNames("font-display text-[16px] font-extrabold leading-none tracking-[-0.04em]", today ? "text-ink-950" : "text-ink-700")}>
                                {format(day, "d")}
                              </p>
                              {holiday && <span className="h-1 w-1 rounded-full bg-coral-400" title={holiday.name} />}
                            </div>
                            {holiday && (
                              <p className="mt-0.5 truncate text-[7px] font-semibold text-coral-600">{holiday.name}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="relative grid grid-cols-[52px_repeat(7,1fr)]">
                      <div className="border-r border-ink-50">
                        {Array.from({ length: GRID_END - GRID_START }).map((_, index) => (
                          <div
                            key={index}
                            className="relative border-b border-ink-50 pr-1.5 pt-0.5 text-right"
                            style={{ height: HOUR_HEIGHT }}
                          >
                            <span className="font-mono text-[8px] text-ink-500">
                              {format(new Date(2026, 0, 1, GRID_START + index), "HH:mm")}
                            </span>
                          </div>
                        ))}
                      </div>
                      {days.map((day, dayIndex) => {
                        const dayEvents = layoutDay(eventsOn(events, day, settings));
                        const today = isSameDay(day, new Date());
                        return (
                          <div key={day.toISOString()} className={classNames("relative border-l border-ink-100", today && "bg-[#FAFCF5]")}>
                            {Array.from({ length: GRID_END - GRID_START }).map((_, index) => (
                              <div key={index} className="border-b border-ink-50" style={{ height: HOUR_HEIGHT }} />
                            ))}
                            {today && currentTimeTop >= 0 && currentTimeTop <= (GRID_END - GRID_START) * HOUR_HEIGHT && (
                              <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: currentTimeTop }}>
                                <div className="relative h-px bg-coral-400">
                                  <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-coral-400 ring-2 ring-white" />
                                </div>
                              </div>
                            )}
                            {dayEvents.map(({ event, lane, lanes }) => {
                              const start = timeToMinutes(event.start_time);
                              const end = timeToMinutes(event.end_time);
                              const top = ((start / 60) - GRID_START) * HOUR_HEIGHT;
                              const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 30);
                              const colors = eventColor(event, clashes);
                              const hasClash = clashEventIds.has(event.id);
                              const width = lanes > 1 ? `calc(${100 / lanes}% - 5px)` : "calc(100% - 8px)";
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => setActiveEvent(event)}
                                  className={classNames(
                                    "absolute z-10 overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left shadow-[0_2px_6px_rgba(13,20,17,.04)] transition hover:z-30 hover:shadow-lift",
                                    colors.bg,
                                    colors.border,
                                  )}
                                  style={{
                                    top: top + 2,
                                    height: height - 3,
                                    left: `${(lane / lanes) * 100 + 0.5}%`,
                                    width,
                                  }}
                                  title={`${event.course_code} ${event.title} · ${timeRange(event.start_time, event.end_time)}`}
                                >
                                  <div className="flex items-center gap-1">
                                    {hasClash && <TriangleAlert size={8} className="shrink-0 text-coral-500" />}
                                    <p className={classNames("truncate font-mono text-[7px] font-bold uppercase tracking-wide", colors.text)}>
                                      {event.course_code || event.event_type}
                                    </p>
                                  </div>
                                  <p className="truncate text-[9px] font-semibold leading-3 text-ink-800">{event.title}</p>
                                  {height > 42 && (
                                    <p className="mt-0.5 truncate text-[7px] text-ink-500">
                                      {formatTime(event.start_time)} · {event.room || "TBC"}
                                    </p>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-ink-50">
                  {weekEvents.length === 0 ? (
                    <EmptyState
                      icon={<CalendarDays size={20} />}
                      title="A quiet week"
                      body="No classes or exams fall in this week. Try the next week or import a fresh timetable."
                    />
                  ) : (
                    days.map((day) => {
                      const dayEvents = eventsOn(events, day, settings);
                      if (!dayEvents.length) return null;
                      return (
                        <div key={day.toISOString()} className="grid grid-cols-[72px_1fr] gap-3 px-4 py-4 sm:px-5">
                          <div>
                            <p className={classNames("text-[9px] font-bold uppercase tracking-[0.12em]", isSameDay(day, new Date()) ? "text-teal-600" : "text-ink-400")}>
                              {format(day, "EEE")}
                            </p>
                            <p className="font-display text-[20px] font-extrabold tracking-[-0.04em] text-ink-900">{format(day, "d")}</p>
                            <p className="text-[9px] text-ink-400">{format(day, "MMM")}</p>
                          </div>
                          <div className="space-y-2">
                            {dayEvents.map((event) => {
                              const colors = eventColor(event, clashes);
                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  onClick={() => setActiveEvent(event)}
                                  className={classNames("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:shadow-soft", colors.bg, colors.border)}
                                >
                                  <span className={classNames("h-8 w-1 shrink-0 rounded-full", colors.dot)} />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="font-mono text-[9px] font-bold text-ink-400">{event.course_code}</p>
                                      {clashEventIds.has(event.id) && <Badge tone="danger">Clash</Badge>}
                                      {event.is_core && <Badge tone="lime">Core</Badge>}
                                    </div>
                                    <p className="mt-0.5 truncate text-[12px] font-semibold text-ink-900">{event.title}</p>
                                    <p className="mt-0.5 text-[10px] text-ink-500">
                                      {timeRange(event.start_time, event.end_time)} · {event.room || "TBC"}
                                    </p>
                                  </div>
                                  <ChevronRight size={14} className="text-ink-300" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </Card>

            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="eyebrow">Sync snapshot</p>
                    <p className="mt-1 font-display text-[15px] font-bold text-ink-950">
                      {data.sync.ready ? "Ready to write" : "Approval pending"}
                    </p>
                  </div>
                  <div
                    className="relative flex h-12 w-12 items-center justify-center rounded-full"
                    style={{ background: `conic-gradient(${tone.ring} ${data.summary.readiness * 3.6}deg, #E8EDE9 0deg)` }}
                  >
                    <div className="absolute inset-[3px] rounded-full bg-white" />
                    <span className="relative text-[9px] font-bold text-ink-700">{data.summary.readiness}%</span>
                  </div>
                </div>
                <div className="mt-4 space-y-2.5 border-t border-ink-100 pt-3.5">
                  <SnapshotRow label="Approved events" value={`${approved} / ${events.length}`} />
                  <SnapshotRow label="Recurring streams" value={String(data.sync.recurring)} />
                  <SnapshotRow label="One-off exams" value={String(data.sync.exams)} />
                  <SnapshotRow
                    label="Open clashes"
                    value={String(clashes.length)}
                    danger={clashes.length > 0}
                  />
                </div>
                <Button className="mt-4 w-full" size="sm" onClick={() => setSyncOpen(true)} icon={<ShieldCheck size={13} />}>
                  Review & sync
                </Button>
                <button
                  type="button"
                  onClick={() => void download()}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-200 py-2 text-[10px] font-semibold text-ink-600 transition hover:bg-ink-50"
                >
                  <Download size={12} />
                  Download approved .ics
                </button>
              </Card>

              <Card className="p-4">
                <p className="eyebrow">Legend</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Legend color="bg-[#8DB95A]" label="Core class" />
                  <Legend color="bg-ink-400" label="Elective" />
                  <Legend color="bg-teal-500" label="Lab" />
                  <Legend color="bg-amber-500" label="Exam" />
                  <Legend color="bg-coral-500" label="Clash" />
                </div>
                <div className="mt-4 rounded-xl bg-ink-50 p-3">
                  <p className="flex items-center gap-1.5 text-[9px] font-bold text-ink-700">
                    <Sparkles size={11} className="text-lime-500" />
                    Term rules applied
                  </p>
                  <p className="mt-1.5 text-[9px] leading-4 text-ink-500">
                    {formatDateRange(settings.termStart, settings.termEnd)} · reading week and {settings.holidays.length} holidays excluded from recurrence.
                  </p>
                </div>
              </Card>

              {clashes.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="border-b border-coral-100 bg-coral-50 px-4 py-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold text-coral-600">
                      <TriangleAlert size={12} />
                      {clashes.length} clash{clashes.length > 1 ? "es" : ""} on calendar
                    </p>
                  </div>
                  <div className="divide-y divide-ink-50">
                    {clashes.slice(0, 2).map((clash) => (
                      <button
                        key={clash.id}
                        type="button"
                        onClick={() => setActiveClash(clash)}
                        className="w-full px-4 py-3 text-left transition hover:bg-ink-50/60"
                      >
                        <p className="text-[10px] font-semibold text-ink-800">
                          {clash.event_a_code} ↔ {clash.event_b_code}
                        </p>
                        <p className="mt-0.5 text-[9px] text-ink-400">{clash.overlap_minutes} min overlap · resolve</p>
                      </button>
                    ))}
                  </div>
                </Card>
              )}

              <Card className="p-4">
                <p className="eyebrow">Existing calendar</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${data.google.connected ? "bg-teal-50 text-teal-600" : "bg-ink-50 text-ink-400"}`}>
                    {data.google.connected ? <CheckCircle2 size={15} /> : <CalendarDays size={15} />}
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold text-ink-800">
                      {data.google.connected ? "Google Calendar connected" : "Google Calendar not connected"}
                    </p>
                    <p className="text-[9px] text-ink-400">
                      {data.google.connected ? "Idempotent sync enabled" : "Use .ics or connect OAuth"}
                    </p>
                  </div>
                </div>
                <a
                  href="/integrations"
                  className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-500"
                >
                  Manage integration
                  <ExternalLink size={10} />
                </a>
              </Card>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-100 bg-white/60 px-4 py-3 text-[9px] text-ink-400">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={10} />
              Times shown in {settings.timezone}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={10} />
              Reading week {format(new Date(`${settings.readingWeekStart}T00:00:00`), "MMM d")}–
              {format(new Date(`${settings.readingWeekEnd}T00:00:00`), "MMM d")} excluded
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ArrowRight size={10} />
              Changes remain staged until you approve
            </span>
          </div>
        </div>
      </div>

      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
      <EventModal event={activeEvent} onClose={() => setActiveEvent(null)} />
      <ClashModal clash={activeClash} onClose={() => setActiveClash(null)} />
    </>
  );
}

function SnapshotRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-ink-500">{label}</span>
      <span className={classNames("font-mono text-[10px] font-bold", danger ? "text-coral-600" : "text-ink-800")}>{value}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-[9px] text-ink-500">{label}</span>
    </div>
  );
}
