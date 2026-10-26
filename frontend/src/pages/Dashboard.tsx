import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  FileWarning,
  GitCompareArrows,
  Mail,
  MapPin,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  Waypoints,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { addDays, format } from "date-fns";
import type { Clash, ScheduleEvent, UnparsedRow } from "../types";
import {
  classNames,
  eventColor,
  eventsOn,
  formatTime,
  nextClass,
  readinessTone,
  relativeTime,
  timeRange,
} from "../lib/utils";
import { api } from "../lib/api";
import { Badge, Button, Card, SectionHeading } from "../components/ui";
import { SyncModal } from "../components/SyncModal";
import { ClashModal } from "../components/ClashModal";
import { UnparsedModal } from "../components/UnparsedModal";
import { EventModal } from "../components/EventModal";

export default function DashboardPage() {
  const { data, toast, refresh } = useApp();
  const [syncOpen, setSyncOpen] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [activeClash, setActiveClash] = useState<Clash | null>(null);
  const [activeUnparsed, setActiveUnparsed] = useState<UnparsedRow | null>(null);
  const [activeEvent, setActiveEvent] = useState<ScheduleEvent | null>(null);

  if (!data) return null;
  const { events, clashes, unparsed, settings, dashboard, studyPlan, notifications } = data;
  const summary = dashboard.summary;
  const readiness = summary.readiness;
  const tone = readinessTone(readiness);
  const next = nextClass(events, settings);

  const sendDigest = async () => {
    setSendingDigest(true);
    try {
      const result = await api.sendDigestEmail();
      toast(result.message, result.status === "failed" ? "error" : "success");
      await refresh(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send the digest.", "error");
    } finally {
      setSendingDigest(false);
    }
  };

  const upcoming = useMemo(() => {
    const output: { date: Date; event: ScheduleEvent }[] = [];
    for (let offset = 0; offset < 8; offset += 1) {
      const date = addDays(new Date(), offset);
      eventsOn(events, date, settings).forEach((event) => output.push({ date, event }));
    }
    return output.slice(0, 5);
  }, [events, settings]);

  const todayEvents = eventsOn(events, new Date(), settings);
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const lastRun = dashboard.lastRun;
  const lastStats = lastRun?.stats;

  const heroSummary = () => {
    const pieces = [`${summary.events} classes read`];
    pieces.push(`${clashes.length} collision${clashes.length === 1 ? "" : "s"} caught`);
    if (unparsed.length) pieces.push(`${unparsed.length} row${unparsed.length === 1 ? "" : "s"} quarantined`);
    return pieces.join(". ") + ".";
  };

  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pb-6 pt-5 sm:px-6 lg:px-8">
        <div className="stagger">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
                <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
                {format(new Date(), "EEEE, MMMM d")} · {settings.institution}
              </p>
              <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-[-0.045em] text-ink-950 sm:text-[34px]">
                {greeting}, buddy.
              </h1>
              <p className="mt-1 max-w-xl text-[13px] leading-6 text-ink-500">
                Your schedule integrity check is complete. Review what the agent found before anything touches your
                calendar.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/sources"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-[12px] font-semibold text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
              >
                <Upload size={14} />
                Import schedule
              </Link>
              <Button onClick={() => setSyncOpen(true)} icon={<ShieldCheck size={14} />}>
                Review & sync
              </Button>
            </div>
          </div>

          <section className="relative mt-6 overflow-hidden rounded-[28px] bg-ink-950 text-white shadow-lift">
            <div className="pointer-events-none absolute -right-28 -top-44 h-[430px] w-[430px] rounded-full border border-lime-400/15" />
            <div className="pointer-events-none absolute -right-8 -top-24 h-[270px] w-[270px] rounded-full border border-lime-400/20 bg-lime-400/[0.06]" />
            <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-80 bg-teal-500/10 blur-3xl" />
            <div className="grid-paper pointer-events-none absolute inset-0 opacity-[0.16]" />
            <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.45fr_.55fr] lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="dark" className="border-white/10 bg-white/[0.07] text-lime-300">
                    <Sparkles size={10} />
                    Agent briefing
                  </Badge>
                  <span className="flex items-center gap-1.5 text-[10px] text-white/55">
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-lime-400" />
                    {lastRun ? `Last run ${relativeTime(lastRun.started_at)}` : "Ready for first run"}
                  </span>
                </div>
                <h2 className="mt-4 max-w-xl font-display text-[26px] font-extrabold leading-[1.15] tracking-[-0.045em] sm:text-[32px]">
                  {heroSummary().split(".").filter(Boolean).map((line, index, all) => (
                    <span key={line} className={index === all.length - 1 ? "text-white/60" : ""}>
                      {line}
                      {index < all.length - 1 ? ". " : "."}
                    </span>
                  ))}
                </h2>
                <p className="mt-3 max-w-lg text-[12px] leading-6 text-white/60">
                  Every imported row has a trace ID. Clashes stay isolated until you resolve them, and low-confidence
                  rows never enter the calendar silently.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  <Link
                    to="/review"
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-lime-400 px-4 text-[12px] font-bold text-ink-950 transition hover:bg-lime-300"
                  >
                    Open review queue
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    to="/calendar"
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <CalendarDays size={14} />
                    Preview week
                  </Link>
                </div>
                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.08] pt-4 text-[10px] text-white/55">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="text-teal-400" />
                    {lastStats?.new ?? summary.events} new events staged
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <GitCompareArrows size={11} className="text-lime-400" />
                    Idempotent delta processing
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Waypoints size={11} className="text-white/60" />
                    {lastStats?.traceId || dashboard.lastRun?.trace_id || "trace pending"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-5 rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4 backdrop-blur-sm sm:p-5 lg:flex-col lg:items-stretch">
                <div className="flex items-center gap-4">
                  <div
                    className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(${tone.ring} ${readiness * 3.6}deg, rgba(255,255,255,.08) 0deg)`,
                    }}
                  >
                    <div className="absolute inset-[5px] rounded-full bg-ink-900" />
                    <div className="relative text-center">
                      <p className="font-display text-[25px] font-extrabold tracking-[-0.06em] text-white">
                        {readiness}%
                      </p>
                      <p className="text-[8px] font-bold uppercase tracking-[0.13em] text-white/55">readiness</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">Sync readiness</p>
                    <p className="mt-1 font-display text-[14px] font-bold text-white">{tone.label}</p>
                    <p className="mt-1 text-[10px] leading-4 text-white/55">
                      {summary.approved} of {summary.events} verified events approved.
                    </p>
                  </div>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-2">
                  <HeroStat value={summary.events} label="staged" />
                  <HeroStat value={clashes.length} label="clashes" tone={clashes.length ? "coral" : undefined} />
                  <HeroStat value={unparsed.length} label="unparsed" tone={unparsed.length ? "amber" : undefined} />
                  <HeroStat value={summary.sources} label="sources" />
                </div>
              </div>
            </div>
          </section>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<BookOpenCheck size={17} />}
              label="Verified events"
              value={summary.events}
              note={`${events.filter((event) => event.is_core).length} core · ${events.filter((event) => !event.is_core).length} elective`}
              accent="lime"
              bars={[38, 60, 46, 74, 66, 92, 80]}
            />
            <StatCard
              icon={<TriangleAlert size={17} />}
              label="Open clashes"
              value={clashes.length}
              note={clashes.length ? "Needs your mediation" : "No overlaps found"}
              accent={clashes.length ? "coral" : "teal"}
              bars={[20, 30, 45, 25, 70, 55, 45]}
            />
            <StatCard
              icon={<FileWarning size={17} />}
              label="Unparsed rows"
              value={unparsed.length}
              note="Held outside the calendar"
              accent={unparsed.length ? "amber" : "teal"}
              bars={[12, 22, 16, 34, 24, 18, 10]}
            />
            <StatCard
              icon={<Database size={17} />}
              label="Source traces"
              value={summary.sources}
              note={`${dashboard.lastRun?.engine || "Deterministic"} engine`}
              accent="ink"
              bars={[24, 44, 38, 54, 44, 72, 64]}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
            <Card className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
                <SectionHeading
                  eyebrow="Next up"
                  title="Your next seven days"
                  description={
                    next
                      ? `Next: ${next.event.course_code || next.event.title} on ${format(next.date, "EEEE")}`
                      : "Nothing scheduled in the next week."
                  }
                />
                <Link
                  to="/calendar"
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-500"
                >
                  Calendar
                  <ChevronRight size={12} />
                </Link>
              </div>

              {next && (
                <div className="mx-5 mt-4 flex flex-col gap-3 rounded-2xl border border-ink-100 bg-ink-50/60 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-ink-900 text-white">
                    <span className="text-[8px] font-bold uppercase tracking-wider text-white/60">
                      {format(next.date, "MMM")}
                    </span>
                    <span className="font-display text-[17px] font-extrabold leading-none">{format(next.date, "d")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-[10px] font-bold text-ink-400">{next.event.course_code}</p>
                      <Badge tone={next.event.is_core ? "lime" : "neutral"}>
                        {next.event.is_core ? "Core" : "Elective"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate font-display text-[14px] font-bold text-ink-950">
                      {next.event.title}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={10} />
                        {timeRange(next.event.start_time, next.event.end_time)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={10} />
                        {next.event.room || "Room TBC"}
                      </span>
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setActiveEvent(next.event)}>
                    Details
                  </Button>
                </div>
              )}

              <div className="p-3 sm:p-4">
                {upcoming.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[12px] text-ink-400">No upcoming events.</p>
                ) : (
                  <div className="divide-y divide-ink-50">
                    {upcoming.map(({ date, event }, index) => {
                      const colors = eventColor(event, clashes);
                      return (
                        <button
                          key={`${event.id}-${date.toISOString()}-${index}`}
                          type="button"
                          onClick={() => setActiveEvent(event)}
                          className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-ink-50/70"
                        >
                          <span className="w-11 shrink-0 text-center">
                            <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-ink-400">
                              {format(date, "EEE")}
                            </span>
                            <span className="mt-0.5 block font-display text-[16px] font-extrabold tracking-[-0.04em] text-ink-900">
                              {format(date, "d")}
                            </span>
                          </span>
                          <span className={classNames("h-9 w-1 shrink-0 rounded-full", colors.dot)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="block truncate text-[12px] font-semibold text-ink-900">
                                {event.course_code ? `${event.course_code} · ` : ""}
                                {event.title}
                              </span>
                              {clashes.some(
                                (clash) => clash.event_a_id === event.id || clash.event_b_id === event.id,
                              ) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-coral-500" />}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-ink-400">
                              {timeRange(event.start_time, event.end_time)} · {event.room || "Room TBC"}
                            </span>
                          </span>
                          <ChevronRight
                            size={14}
                            className="text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-500"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>

            <Card className="flex flex-col overflow-hidden">
              <div className="border-b border-ink-100 px-5 py-4">
                <SectionHeading
                  eyebrow="Clash detector"
                  title="Collisions caught"
                  description="Core requirements vs elected streams"
                  action={
                    <span
                      className={classNames(
                        "flex h-8 min-w-8 items-center justify-center rounded-xl px-2 font-display text-[15px] font-extrabold",
                        clashes.length ? "bg-coral-50 text-coral-600" : "bg-teal-50 text-teal-600",
                      )}
                    >
                      {clashes.length}
                    </span>
                  }
                />
              </div>
              <div className="flex-1 p-3">
                {clashes.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-500">
                      <Check size={22} />
                    </span>
                    <p className="mt-3 text-[12px] font-bold text-ink-800">No collisions found</p>
                    <p className="mt-1 text-[10px] text-ink-400">Your schedule is internally consistent.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clashes.slice(0, 2).map((clash) => (
                      <button
                        key={clash.id}
                        type="button"
                        onClick={() => setActiveClash(clash)}
                        className="group w-full rounded-2xl border border-coral-100 bg-coral-50/60 p-3.5 text-left transition hover:border-coral-400/60 hover:bg-coral-50"
                      >
                        <div className="flex items-center justify-between">
                          <Badge tone="danger" dot>
                            {clash.overlap_minutes} min overlap
                          </Badge>
                          <span className="text-[9px] font-semibold text-coral-600 opacity-0 transition group-hover:opacity-100">
                            Resolve →
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          <span className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-ink-700">
                            {clash.event_a_code || "A"}
                          </span>
                          <span className="h-px flex-1 bg-coral-200" />
                          <span className="font-mono text-[8px] font-bold text-coral-600">VS</span>
                          <span className="h-px flex-1 bg-coral-200" />
                          <span className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-ink-700">
                            {clash.event_b_code || "B"}
                          </span>
                        </div>
                        <p className="mt-2 text-[10px] leading-4 text-ink-600">
                          {clash.event_a_title} · {clash.event_a_days.join(", ")} {formatTime(clash.event_a_start)}
                        </p>
                        <p className="text-[10px] leading-4 text-ink-500">
                          {clash.event_b_title} · {clash.event_b_days.join(", ")} {formatTime(clash.event_b_start)}
                        </p>
                      </button>
                    ))}
                    {clashes.length > 2 && (
                      <p className="px-2 pt-1 text-[10px] text-ink-400">+ {clashes.length - 2} more in review queue</p>
                    )}
                  </div>
                )}
              </div>
              <div className="border-t border-ink-100 p-3">
                <Link
                  to="/review"
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-ink-900 text-[11px] font-semibold text-white transition hover:bg-ink-800"
                >
                  Review all flagged items
                  <ArrowRight size={12} />
                </Link>
              </div>
            </Card>
          </div>

          <Card className="mt-4 overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <SectionHeading
                eyebrow="AI study agent"
                title="AI study timetable"
                description={`${studyPlan.summary.coverage} · one focused hour per subject, placed just before it next meets.`}
              />
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <Badge tone="lime">
                  <Sparkles size={10} />
                  Auto-generated
                </Badge>
                <Link
                  to="/study-plan"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-500"
                >
                  Full plan
                  <ChevronRight size={12} />
                </Link>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.6fr_1fr]">
              <div className="p-4">
                {studyPlan.blocks.length === 0 ? (
                  <p className="rounded-2xl border border-ink-100 bg-ink-50/60 p-5 text-center text-[12px] text-ink-500">
                    Upload a timetable and the study agent will build a weekly plan from your class days.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {studyPlan.byDay
                      .filter((day) => day.blocks.length > 0)
                      .map((day) => (
                        <div key={day.day} className="rounded-2xl border border-ink-100 bg-ink-50/45 p-2.5">
                          <p className="px-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-400">
                            {day.label}
                          </p>
                          <div className="mt-1.5 space-y-1.5">
                            {day.blocks.map((block) => (
                              <div
                                key={block.id}
                                className="rounded-xl border border-ink-100 bg-white p-2.5 shadow-[0_1px_0_rgba(13,20,17,.03)]"
                              >
                                <p className="font-mono text-[9px] font-semibold text-teal-600">
                                  {block.start_time}–{block.end_time}
                                </p>
                                <p className="mt-0.5 truncate text-[12px] font-bold text-ink-950">{block.course_code}</p>
                                <p className="truncate text-[9px] text-ink-400">{block.course_title}</p>
                                <p className="mt-1 flex items-center gap-1 text-[9px] text-ink-500">
                                  <CalendarClock size={9} className="shrink-0" />
                                  {block.anchor}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                <p className="mt-3 flex items-start gap-1.5 px-1 text-[10px] leading-4 text-ink-400">
                  <Sparkles size={11} className="mt-0.5 shrink-0 text-lime-600" />
                  Blocks avoid class times, holidays and reading week. They are suggestions until you export the study
                  plan.
                </p>
              </div>

              <div className="border-t border-ink-100 bg-ink-50/40 p-4 lg:border-l lg:border-t-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-teal-600 shadow-sm">
                      <Mail size={15} />
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Email digest</p>
                      <p className="text-[12px] font-semibold text-ink-900">
                        {notifications.email.courseCount} subjects · {notifications.email.blockCount} study blocks
                      </p>
                    </div>
                  </div>
                  <Badge tone="neutral">To {notifications.email.to.split("@")[0]}</Badge>
                </div>
                <p className="mt-3 text-[11px] font-semibold text-ink-800">{notifications.email.subject}</p>
                <pre className="mt-2 max-h-32 overflow-hidden whitespace-pre-wrap rounded-xl border border-ink-100 bg-white px-3 py-2.5 font-sans text-[10px] leading-5 text-ink-500">
                  {notifications.email.text.split("\n").slice(0, 9).join("\n")}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" icon={<Send size={13} />} onClick={() => void sendDigest()} loading={sendingDigest}>
                    Send digest
                  </Button>
                  <Link
                    to="/study-plan"
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 text-[12px] font-semibold text-ink-700 transition hover:border-ink-300 hover:bg-ink-50"
                  >
                    Preview
                    <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <SectionHeading eyebrow="Quarantine bin" title="Unparsed rows" />
                <Badge tone={unparsed.length ? "warning" : "success"}>{unparsed.length} held</Badge>
              </div>
              {unparsed.length === 0 ? (
                <div className="flex items-center gap-3 p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                    <Check size={17} />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-ink-800">Nothing in the bin</p>
                    <p className="text-[10px] text-ink-400">Every source row has been read with confidence.</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-ink-50">
                  {unparsed.slice(0, 3).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setActiveUnparsed(row)}
                      className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-ink-50/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <ScanLine size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[10px] text-ink-600">{row.raw_text}</span>
                        <span className="mt-0.5 block text-[9px] text-ink-400">
                          {row.reason} · row {row.source_row ?? "—"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[9px] font-semibold text-amber-600 opacity-0 transition group-hover:opacity-100">
                        Translate →
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="border-t border-ink-100 px-5 py-2.5">
                <Link to="/review" className="flex items-center gap-1 text-[10px] font-semibold text-ink-500 hover:text-ink-900">
                  Open unparsed bin
                  <ArrowUpRight size={11} />
                </Link>
              </div>
            </Card>

            <Card className="overflow-hidden bg-ink-950 text-white">
              <div className="border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-white/55">Last agent run</p>
                    <p className="mt-1 font-display text-[15px] font-bold">Extraction trace</p>
                  </div>
                  <span className="flex h-8 items-center gap-1.5 rounded-lg border border-lime-400/15 bg-lime-400/[0.07] px-2 text-[9px] font-bold uppercase tracking-wider text-lime-300">
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-lime-400" />
                    Complete
                  </span>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-3 gap-2">
                  <DarkStat value={lastStats?.new ?? 0} label="new" />
                  <DarkStat value={lastStats?.unchanged ?? 0} label="unchanged" />
                  <DarkStat value={lastStats?.unparsed ?? 0} label="held" tone="amber" />
                </div>
                <div className="mt-5 space-y-2.5">
                  {["Source trace mapped", "Rows normalized & gated", "Clash scan completed", "Staged for approval"].map(
                    (step, index) => (
                      <div key={step} className="flex items-center gap-2.5">
                        <span
                          className={classNames(
                            "flex h-5 w-5 items-center justify-center rounded-full border",
                            index === 3
                              ? "border-lime-400/30 bg-lime-400/10 text-lime-300"
                              : "border-teal-400/20 bg-teal-400/10 text-teal-300",
                          )}
                        >
                          <Check size={10} strokeWidth={3} />
                        </span>
                        <p className="text-[10px] text-white/50">{step}</p>
                        <span className="ml-auto font-mono text-[8px] text-white/60">
                          {index < 3 ? `0${index + 1}` : "04"}
                        </span>
                      </div>
                    ),
                  )}
                </div>
                <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2">
                  <span className="truncate font-mono text-[9px] text-white/55">
                    {lastStats?.traceId || "tr_awaiting"}
                  </span>
                  <span className="shrink-0 text-[9px] text-white/55">
                    {lastRun ? `${lastStats?.parsed ?? 0} rows` : "—"}
                  </span>
                </div>
                <Link
                  to="/sources"
                  className="mt-3 flex items-center justify-center gap-1 rounded-xl border border-white/10 py-2 text-[10px] font-semibold text-white/55 transition hover:bg-white/[0.06] hover:text-white"
                >
                  Trace source lineage
                  <ChevronRight size={11} />
                </Link>
              </div>
            </Card>
          </div>

          {todayEvents.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-100 bg-white/60 px-4 py-3">
              <CalendarDays size={14} className="text-ink-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">Today</span>
              <span className="h-3 w-px bg-ink-200" />
              {todayEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setActiveEvent(event)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-ink-50 px-2 py-1 text-[10px] font-medium text-ink-600 transition hover:bg-ink-100"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${eventColor(event, clashes).dot}`} />
                  {event.course_code || event.title} · {formatTime(event.start_time)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
      <ClashModal clash={activeClash} onClose={() => setActiveClash(null)} />
      <UnparsedModal row={activeUnparsed} onClose={() => setActiveUnparsed(null)} />
      <EventModal event={activeEvent} onClose={() => setActiveEvent(null)} />
    </>
  );
}

function HeroStat({ value, label, tone }: { value: number; label: string; tone?: "coral" | "amber" }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2">
      <p
        className={classNames(
          "font-display text-[19px] font-extrabold leading-none tracking-[-0.04em]",
          tone === "coral" ? "text-coral-400" : tone === "amber" ? "text-amber-400" : "text-white",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/55">{label}</p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  note,
  accent,
  bars,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note: string;
  accent: "lime" | "coral" | "amber" | "teal" | "ink";
  bars: number[];
}) {
  const accents = {
    lime: { icon: "bg-lime-400/20 text-[#567B22]", bar: "bg-[#9BC84F]" },
    coral: { icon: "bg-coral-50 text-coral-500", bar: "bg-coral-400" },
    amber: { icon: "bg-amber-50 text-amber-600", bar: "bg-amber-500" },
    teal: { icon: "bg-teal-50 text-teal-600", bar: "bg-teal-500" },
    ink: { icon: "bg-ink-50 text-ink-600", bar: "bg-ink-400" },
  }[accent];

  return (
    <Card className="group relative overflow-hidden p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between">
        <span className={classNames("flex h-9 w-9 items-center justify-center rounded-xl", accents.icon)}>
          {icon}
        </span>
        <div className="flex h-7 items-end gap-[3px] opacity-60">
          {bars.map((bar, index) => (
            <span
              key={index}
              className={classNames("w-1 rounded-full", accents.bar)}
              style={{ height: `${Math.max(18, bar * 0.27)}px`, opacity: 0.25 + index * 0.09 }}
            />
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-end gap-2">
        <p className="font-display text-[28px] font-extrabold leading-none tracking-[-0.055em] text-ink-950">
          {value}
        </p>
        <span className="pb-0.5 text-[10px] font-semibold text-ink-400">{label}</span>
      </div>
      <p className="mt-1.5 text-[10px] text-ink-400">{note}</p>
    </Card>
  );
}

function DarkStat({ value, label, tone }: { value: number; label: string; tone?: "amber" }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <p
        className={classNames(
          "font-display text-[17px] font-extrabold leading-none",
          tone === "amber" ? "text-amber-400" : "text-white",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[8px] uppercase tracking-[0.1em] text-white/55">{label}</p>
    </div>
  );
}
