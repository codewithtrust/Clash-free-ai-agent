import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileWarning,
  Filter,
  ListChecks,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import type { Clash, ScheduleEvent, UnparsedRow } from "../types";
import { Badge, Button, Card, Confidence, EmptyState } from "../components/ui";
import { SyncModal } from "../components/SyncModal";
import { ClashModal } from "../components/ClashModal";
import { UnparsedModal } from "../components/UnparsedModal";
import { EventModal } from "../components/EventModal";
import { classNames, eventSubtitle, relativeTime, timeRange } from "../lib/utils";

type Tab = "all" | "verified" | "clash" | "unparsed";

export default function ReviewPage() {
  const { data, refresh, toast } = useApp();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [syncOpen, setSyncOpen] = useState(false);
  const [activeClash, setActiveClash] = useState<Clash | null>(null);
  const [activeUnparsed, setActiveUnparsed] = useState<UnparsedRow | null>(null);
  const [activeEvent, setActiveEvent] = useState<ScheduleEvent | null>(null);
  const [approving, setApproving] = useState(false);

  if (!data) return null;
  const { events, clashes, unparsed } = data;
  const clashEventIds = new Set(clashes.flatMap((clash) => [clash.event_a_id, clash.event_b_id]));
  const approved = events.filter((event) => event.approved).length;

  const filteredEvents = useMemo(() => {
    let list = events;
    if (tab === "verified") list = list.filter((event) => !clashEventIds.has(event.id));
    if (tab === "clash") list = list.filter((event) => clashEventIds.has(event.id));
    if (source !== "all") list = list.filter((event) => event.source_id === source);
    const search = query.trim().toLowerCase();
    if (search) {
      list = list.filter((event) =>
        [event.title, event.course_code, event.room, event.section, event.instructor]
          .join(" ")
          .toLowerCase()
          .includes(search),
      );
    }
    return list;
  }, [events, tab, source, query, clashes]);

  const filteredUnparsed = useMemo(() => {
    let list = unparsed;
    if (source !== "all") list = list.filter((row) => row.source_id === source);
    const search = query.trim().toLowerCase();
    if (search) list = list.filter((row) => `${row.raw_text} ${row.reason}`.toLowerCase().includes(search));
    return list;
  }, [unparsed, source, query]);

  const approveAll = async () => {
    setApproving(true);
    try {
      const result = await api.approveAll();
      await refresh(true);
      if (result.blocked > 0) {
        toast(
          `${result.updated} clean event${result.updated === 1 ? "" : "s"} approved. Resolve ${result.blocked} clash-linked event${result.blocked === 1 ? "" : "s"} before syncing.`,
          "info",
        );
      } else {
        toast(`${result.updated} event${result.updated === 1 ? "" : "s"} approved and ready for sync.`);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not approve events.", "error");
    } finally {
      setApproving(false);
    }
  };

  const toggleApproval = async (event: ScheduleEvent) => {
    try {
      await api.approveOne(event.id, !event.approved);
      await refresh(true);
      toast(event.approved ? "Approval removed." : "Event approved.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update approval.", "error");
    }
  };

  const tabs: { id: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "all", label: "All staged", count: events.length, icon: <ListChecks size={13} /> },
    { id: "verified", label: "Clean", count: events.filter((event) => !clashEventIds.has(event.id)).length, icon: <CheckCircle2 size={13} /> },
    { id: "clash", label: "Clashes", count: clashes.length, icon: <TriangleAlert size={13} /> },
    { id: "unparsed", label: "Unparsed", count: unparsed.length, icon: <FileWarning size={13} /> },
  ];

  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <div className="stagger">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Staging review</p>
              <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-[-0.045em] text-ink-950 sm:text-[32px]">
                Review queue
              </h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-6 text-ink-500">
                Verify what the agent read, mediate collisions, and translate blurry rows. Only approved events can
                reach your calendar.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/sources"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-[12px] font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                <Upload size={14} />
                Add source
              </Link>
              <Button onClick={() => setSyncOpen(true)} icon={<ShieldCheck size={14} />}>
                Approve & sync
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<CheckCircle2 size={16} />}
              tone="teal"
              label="Clean events"
              value={events.length - clashEventIds.size}
              sub="Ready to approve"
            />
            <SummaryCard
              icon={<TriangleAlert size={16} />}
              tone={clashes.length ? "coral" : "teal"}
              label="Schedule clashes"
              value={clashes.length}
              sub={clashes.length ? "Require mediation" : "No overlaps"}
            />
            <SummaryCard
              icon={<FileWarning size={16} />}
              tone={unparsed.length ? "amber" : "teal"}
              label="Unparsed rows"
              value={unparsed.length}
              sub="Never guessed at"
            />
            <SummaryCard
              icon={<ShieldCheck size={16} />}
              tone="ink"
              label="Approved"
              value={approved}
              sub={`${events.length ? Math.round((approved / events.length) * 100) : 0}% of queue`}
            />
          </div>

          {clashes.length > 0 && (
            <Card className="mt-4 overflow-hidden">
              <div className="flex flex-col justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral-50 text-coral-500">
                    <AlertTriangle size={17} />
                  </span>
                  <div>
                    <h2 className="font-display text-[15px] font-bold text-ink-950">Conflict mediation</h2>
                    <p className="mt-0.5 text-[11px] text-ink-500">
                      {clashes.length} direct overlap{clashes.length > 1 ? "s" : ""} between core requirements and
                      elective streams.
                    </p>
                  </div>
                </div>
                <Badge tone="danger" dot>
                  Zero silent drops
                </Badge>
              </div>
              <div className="grid gap-2.5 p-3 sm:grid-cols-2">
                {clashes.map((clash) => (
                  <button
                    key={clash.id}
                    type="button"
                    onClick={() => setActiveClash(clash)}
                    className="group rounded-2xl border border-coral-100 bg-coral-50/50 p-3.5 text-left transition hover:border-coral-300 hover:bg-coral-50"
                  >
                    <div className="flex items-center justify-between">
                      <Badge tone="danger">{clash.overlap_minutes} min overlap</Badge>
                      <span className="text-[9px] font-semibold text-coral-600">
                        {clash.severity === "high" ? "High severity" : "Review"}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[9px] font-bold text-coral-600">
                          {clash.event_a_code || "COURSE A"}
                        </p>
                        <p className="truncate text-[11px] font-semibold text-ink-800">{clash.event_a_title}</p>
                        <p className="text-[9px] text-ink-400">
                          {clash.event_a_days.join(", ")} · {timeRange(clash.event_a_start, clash.event_a_end)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md border border-coral-100 bg-white px-1.5 py-1 font-mono text-[8px] font-bold text-coral-600">
                        VS
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[9px] font-bold text-teal-600">
                          {clash.event_b_code || "COURSE B"}
                        </p>
                        <p className="truncate text-[11px] font-semibold text-ink-800">{clash.event_b_title}</p>
                        <p className="text-[9px] text-ink-400">
                          {clash.event_b_days.join(", ")} · {timeRange(clash.event_b_start, clash.event_b_end)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-coral-100/70 pt-2">
                      <span className="text-[9px] text-ink-400">{clash.reason.split("overlaps")[0]}overlaps</span>
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-coral-600">
                        Resolve clash
                        <ArrowRight size={10} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card className="mt-4 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-1">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={classNames(
                      "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition",
                      tab === item.id
                        ? "bg-ink-900 text-white"
                        : "text-ink-500 hover:bg-ink-50 hover:text-ink-800",
                    )}
                  >
                    {item.icon}
                    {item.label}
                    <span
                      className={classNames(
                        "ml-0.5 rounded px-1 font-mono text-[9px]",
                        tab === item.id ? "bg-white/15 text-white" : "bg-ink-100 text-ink-600",
                      )}
                    >
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-[180px] flex-1 lg:flex-none">
                  <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search course, room, trace…"
                    aria-label="Search events"
                    className="h-8 w-full rounded-lg border border-ink-200 bg-white pl-8 pr-8 text-[11px] text-ink-800 placeholder:text-ink-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/10"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                      aria-label="Clear search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </label>
                <label className="relative">
                  <Filter size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                  <select
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    aria-label="Filter by source"
                    className="h-8 appearance-none rounded-lg border border-ink-200 bg-white pl-7 pr-7 text-[10px] font-medium text-ink-600 focus:border-teal-500 focus:outline-none"
                  >
                    <option value="all">All sources</option>
                    {data.sources.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <ChevronRight size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-ink-400" />
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void approveAll()}
                  loading={approving}
                  icon={<Check size={12} />}
                >
                  Approve all
                </Button>
              </div>
            </div>

            {tab === "unparsed" ? (
              filteredUnparsed.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={21} />}
                  title="The quarantine bin is empty"
                  body="Rows that fall below the confidence threshold land here instead of being guessed into your calendar."
                />
              ) : (
                <div className="divide-y divide-ink-50">
                  {filteredUnparsed.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setActiveUnparsed(row)}
                      className="group flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-ink-50/50 sm:px-5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                        <FileWarning size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-ink-600">{row.raw_text}</span>
                          <Badge tone="warning">{Math.round(row.confidence * 100)}% confidence</Badge>
                        </span>
                        <span className="mt-1 block text-[10px] text-ink-400">
                          {row.reason} · {row.source_name} · row {row.source_row ?? "—"} · {relativeTime(row.created_at)}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-ink-600 group-hover:border-ink-300">
                        Translate
                        <ArrowRight size={11} />
                      </span>
                    </button>
                  ))}
                </div>
              )
            ) : filteredEvents.length === 0 ? (
              <EmptyState
                icon={<Search size={21} />}
                title="Nothing matches this filter"
                body="Try another tab, clear the search, or change the source filter."
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setQuery("");
                      setSource("all");
                      setTab("all");
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr className="border-b border-ink-100 bg-ink-50/50 text-left">
                      <th className="w-9 px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400 sm:px-5" />
                      <th className="px-2 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">Course</th>
                      <th className="px-2 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">Schedule</th>
                      <th className="hidden px-2 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400 md:table-cell">
                        Location
                      </th>
                      <th className="hidden px-2 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400 lg:table-cell">
                        Confidence
                      </th>
                      <th className="px-2 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">Status</th>
                      <th className="w-8 px-4 py-2.5 sm:px-5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {filteredEvents.map((event) => {
                      const hasClash = clashEventIds.has(event.id);
                      return (
                        <tr
                          key={event.id}
                          onClick={() => setActiveEvent(event)}
                          className="group cursor-pointer transition hover:bg-ink-50/40"
                        >
                          <td className="px-4 py-3 sm:px-5">
                            <button
                              type="button"
                              onClick={(click) => {
                                click.stopPropagation();
                                void toggleApproval(event);
                              }}
                              className={classNames(
                                "flex h-5 w-5 items-center justify-center rounded-md border transition",
                                event.approved
                                  ? "border-teal-500 bg-teal-500 text-white"
                                  : "border-ink-300 bg-white text-transparent hover:border-ink-400",
                              )}
                              title={event.approved ? "Remove approval" : "Approve event"}
                              aria-label={event.approved ? "Remove approval" : "Approve event"}
                            >
                              <Check size={11} strokeWidth={3} />
                            </button>
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[9px] font-bold text-ink-400">{event.course_code || "—"}</span>
                              {event.is_core && <span className="h-1 w-1 rounded-full bg-[#8DB95A]" title="Core" />}
                            </div>
                            <p className="mt-0.5 max-w-[260px] truncate text-[11.5px] font-semibold text-ink-900">
                              {event.title}
                            </p>
                            <p className="mt-0.5 text-[9px] text-ink-400">
                              {event.event_type} · Sec {event.section || "—"} · {event.instructor || "Instructor TBC"}
                            </p>
                          </td>
                          <td className="px-2 py-3">
                            <p className="text-[10px] font-semibold text-ink-700">
                              {event.event_date ? event.event_date : event.days.join(", ")}
                            </p>
                            <p className="mt-0.5 text-[9px] text-ink-400">{timeRange(event.start_time, event.end_time)}</p>
                          </td>
                          <td className="hidden px-2 py-3 md:table-cell">
                            <p className="flex items-center gap-1 text-[10px] text-ink-600">
                              <MapPin size={10} className="text-ink-300" />
                              {event.room || "Room TBC"}
                            </p>
                            <p className="mt-0.5 truncate text-[9px] text-ink-400">{event.source_name}</p>
                          </td>
                          <td className="hidden px-2 py-3 lg:table-cell">
                            <Confidence value={event.confidence} />
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex flex-col items-start gap-1">
                              {hasClash ? (
                                <Badge tone="danger" dot>
                                  Clash
                                </Badge>
                              ) : event.approved ? (
                                <Badge tone="success" dot>
                                  Approved
                                </Badge>
                              ) : (
                                <Badge tone="neutral">Verified</Badge>
                              )}
                              <span className="font-mono text-[8px] text-ink-500">{event.trace_id}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 sm:px-5">
                            <ChevronRight
                              size={14}
                              className="text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ink-600"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col justify-between gap-2 border-t border-ink-100 bg-ink-50/40 px-4 py-3 text-[9px] text-ink-400 sm:flex-row sm:items-center sm:px-5">
              <span className="inline-flex items-center gap-1.5">
                <Database size={10} />
                {tab === "unparsed" ? filteredUnparsed.length : filteredEvents.length} rows shown · every row retains its
                source trace
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={10} className="text-lime-500" />
                Confidence gate at 45%
              </span>
            </div>
          </Card>

          <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl border border-ink-100 bg-white/70 px-4 py-3.5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <ShieldCheck size={15} />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-ink-800">Human approval gate</p>
                <p className="text-[9px] text-ink-400">
                  Nothing will be written until you approve and explicitly press sync.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => setSyncOpen(true)}>
              Continue to sync
              <ArrowRight size={12} />
            </Button>
          </div>
        </div>
      </div>

      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
      <ClashModal clash={activeClash} onClose={() => setActiveClash(null)} />
      <UnparsedModal row={activeUnparsed} onClose={() => setActiveUnparsed(null)} />
      <EventModal event={activeEvent} onClose={() => setActiveEvent(null)} />
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  tone: "teal" | "coral" | "amber" | "ink";
}) {
  const styles = {
    teal: "bg-teal-50 text-teal-600",
    coral: "bg-coral-50 text-coral-500",
    amber: "bg-amber-50 text-amber-600",
    ink: "bg-ink-50 text-ink-600",
  }[tone];
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={classNames("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", styles)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-ink-400">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="font-display text-[23px] font-extrabold leading-none tracking-[-0.04em] text-ink-950">{value}</p>
          <p className="truncate text-[9px] text-ink-400">{sub}</p>
        </div>
      </div>
    </Card>
  );
}
