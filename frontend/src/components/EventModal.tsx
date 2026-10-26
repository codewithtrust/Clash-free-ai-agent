import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Database,
  FileText,
  Fingerprint,
  MapPin,
  PencilLine,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import type { DayCode, EventType, ScheduleEvent } from "../types";
import { Confidence, Badge, Button, Modal } from "./ui";
import { DAYS, eventSubtitle, formatTime } from "../lib/utils";

const eventTypes: EventType[] = ["lecture", "lab", "tutorial", "seminar", "exam"];

export function EventModal({ event, onClose }: { event: ScheduleEvent | null; onClose: () => void }) {
  const { data, refresh, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    course_code: "",
    section: "",
    event_type: "lecture" as EventType,
    days: [] as DayCode[],
    start_time: "09:00",
    end_time: "10:00",
    event_date: "",
    room: "",
    instructor: "",
    is_core: false,
  });

  useEffect(() => {
    setEditing(false);
    if (!event) return;
    setForm({
      title: event.title,
      course_code: event.course_code,
      section: event.section,
      event_type: event.event_type,
      days: event.days,
      start_time: event.start_time,
      end_time: event.end_time,
      event_date: event.event_date || "",
      room: event.room,
      instructor: event.instructor,
      is_core: event.is_core,
    });
  }, [event]);

  if (!event) return null;
  const relatedClashes = data?.clashes.filter(
    (clash) => clash.event_a_id === event.id || clash.event_b_id === event.id,
  ) ?? [];

  const toggleDay = (day: DayCode) => {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day],
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.updateEvent(event.id, {
        ...form,
        event_date: form.event_date || null,
      });
      await refresh(true);
      toast("Event updated. Approval and clash checks were re-run.");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update event.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleApproval = async () => {
    setBusy(true);
    try {
      await api.approveOne(event.id, !event.approved);
      await refresh(true);
      toast(event.approved ? "Event approval removed." : "Event approved for sync.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update approval.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={editing ? "Edit event" : event.title}
      description={editing ? "Changes reset approval and re-run clash detection." : eventSubtitle(event)}
      footer={
        <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Badge tone={event.approved ? "success" : "neutral"} dot>
              {event.approved ? "Approved" : "Awaiting approval"}
            </Badge>
            {event.synced && <Badge tone="info">Synced</Badge>}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button loading={busy} onClick={() => void save()} icon={<Check size={14} />}>
                  Save changes
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setEditing(true)}
                  icon={<PencilLine size={14} />}
                >
                  Edit details
                </Button>
                <Button
                  variant={event.approved ? "secondary" : "primary"}
                  loading={busy}
                  onClick={() => void toggleApproval()}
                  icon={event.approved ? <CheckCircle2 size={14} /> : <ShieldCheck size={14} />}
                >
                  {event.approved ? "Remove approval" : "Approve event"}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      {editing ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Course title</span>
              <input
                className="input"
                value={form.title}
                onChange={(change) => setForm({ ...form, title: change.target.value })}
              />
            </label>
            <label>
              <span className="label">Course code</span>
              <input
                className="input"
                value={form.course_code}
                onChange={(change) => setForm({ ...form, course_code: change.target.value })}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="label">Type</span>
              <select
                className="select"
                value={form.event_type}
                onChange={(change) => setForm({ ...form, event_type: change.target.value as EventType })}
              >
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Start</span>
              <input
                type="time"
                className="input"
                value={form.start_time}
                onChange={(change) => setForm({ ...form, start_time: change.target.value })}
              />
            </label>
            <label>
              <span className="label">End</span>
              <input
                type="time"
                className="input"
                value={form.end_time}
                onChange={(change) => setForm({ ...form, end_time: change.target.value })}
              />
            </label>
          </div>
          <div>
            <span className="label">Weekdays</span>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((day) => {
                const active = form.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`h-9 min-w-11 rounded-lg border px-2 text-[11px] font-semibold transition ${
                      active
                        ? "border-ink-900 bg-ink-900 text-white"
                        : "border-ink-200 bg-white text-ink-500 hover:border-ink-300"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-ink-400">Leave empty for a one-off exam with a date.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Exam / one-off date</span>
              <input
                type="date"
                className="input"
                value={form.event_date}
                onChange={(change) => setForm({ ...form, event_date: change.target.value })}
              />
            </label>
            <label>
              <span className="label">Room</span>
              <input
                className="input"
                value={form.room}
                onChange={(change) => setForm({ ...form, room: change.target.value })}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Section</span>
              <input
                className="input"
                value={form.section}
                onChange={(change) => setForm({ ...form, section: change.target.value })}
              />
            </label>
            <label>
              <span className="label">Instructor</span>
              <input
                className="input"
                value={form.instructor}
                onChange={(change) => setForm({ ...form, instructor: change.target.value })}
              />
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-ink-100 p-3">
            <input
              type="checkbox"
              checked={form.is_core}
              onChange={(change) => setForm({ ...form, is_core: change.target.checked })}
              className="h-4 w-4 rounded border-ink-300 accent-ink-900"
            />
            <span className="text-[12px] font-medium text-ink-700">This is a core / mandatory requirement</span>
          </label>
        </div>
      ) : (
        <div className="space-y-5">
          {relatedClashes.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-coral-100 bg-coral-50 p-3.5">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-coral-500" />
              <div>
                <p className="text-[12px] font-bold text-coral-600">
                  This event appears in {relatedClashes.length} open clash{relatedClashes.length > 1 ? "es" : ""}.
                </p>
                <p className="mt-1 text-[11px] leading-5 text-ink-600">
                  Resolve the conflict in the review queue before final approval.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Detail icon={<CalendarClock size={14} />} label="Schedule" value={eventSubtitle(event)} />
            <Detail icon={<MapPin size={14} />} label="Location" value={event.room || "Room TBC"} />
            <Detail icon={<UserRound size={14} />} label="Instructor" value={event.instructor || "Not listed"} />
            <Detail icon={<FileText size={14} />} label="Section / type" value={`${event.section || "—"} · ${event.event_type}`} />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <MiniStat label="Parser confidence" value={<Confidence value={event.confidence} />} />
            <MiniStat label="Requirement" value={<Badge tone={event.is_core ? "lime" : "neutral"}>{event.is_core ? "Core" : "Elective"}</Badge>} />
            <MiniStat label="Staged on" value={<span className="font-mono text-[10px] text-ink-600">{event.event_date || "Weekly"}</span>} />
            <MiniStat label="Status" value={<Badge tone={event.status === "verified" ? "success" : "warning"}>{event.status}</Badge>} />
          </div>

          <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-800">
                <Database size={13} className="text-ink-500" />
                Source evidence
              </p>
              <span className="font-mono text-[9px] text-ink-400">{event.trace_id}</span>
            </div>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">Source</p>
                <p className="mt-1 truncate text-[11px] font-medium text-ink-700">
                  {event.source_name || event.evidence?.sourceName || "Unknown"}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">Row / engine</p>
                <p className="mt-1 text-[11px] font-medium text-ink-700">
                  Row {event.evidence?.row ?? "—"} · {event.evidence?.engine || "deterministic"}
                </p>
              </div>
            </div>
            {event.raw_text && (
              <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl border border-ink-100 bg-white p-2.5 font-mono text-[10px] leading-5 text-ink-600">
                {event.raw_text}
              </pre>
            )}
            <div className="mt-3 flex items-center gap-1.5 text-[9px] text-ink-400">
              <Fingerprint size={11} />
              <span className="truncate font-mono">{event.fingerprint.slice(0, 28)}…</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 p-3.5">
      <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
        <span className="text-ink-400">{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-[12px] font-semibold leading-5 text-ink-800">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-3 py-2.5">
      <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</p>
      <div className="mt-1.5">{value}</div>
    </div>
  );
}
