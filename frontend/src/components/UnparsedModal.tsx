import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ScanLine, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import type { DayCode, EventType, UnparsedRow } from "../types";
import { Badge, Button, Modal } from "./ui";
import { DAYS, classNames } from "../lib/utils";

const eventTypes: EventType[] = ["lecture", "lab", "tutorial", "seminar", "exam"];

export function UnparsedModal({ row, onClose }: { row: UnparsedRow | null; onClose: () => void }) {
  const { refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: "",
    course_code: "",
    event_type: "lecture" as EventType,
    days: [] as DayCode[],
    start_time: "09:00",
    end_time: "10:00",
    event_date: "",
    room: "",
    section: "",
    instructor: "",
    is_core: false,
  });

  const suggestion = useMemo(() => {
    if (!row) return { title: "", code: "" };
    const fields = row.raw_text.split("|").map((item) => item.trim()).filter(Boolean);
    const code = fields.find((field) => /^[A-Z]{2,5}\s*\d{3,4}/.test(field.toUpperCase())) || "";
    const title = fields.find((field) => field !== code && /[A-Za-z]{3,}/.test(field)) || "";
    return { title, code };
  }, [row]);

  useEffect(() => {
    if (!row) return;
    setForm((current) => ({
      ...current,
      title: suggestion.title || "Manual course entry",
      course_code: suggestion.code,
    }));
  }, [row, suggestion]);

  if (!row) return null;

  const toggleDay = (day: DayCode) => {
    setForm((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((item) => item !== day) : [...current.days, day],
    }));
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast("Add a title before resolving the row.", "error");
      return;
    }
    if (!form.event_date && form.days.length === 0) {
      toast("Choose at least one weekday or an exam date.", "error");
      return;
    }
    setBusy(true);
    try {
      await api.resolveUnparsed(row.id, { ...form, event_date: form.event_date || null });
      await refresh(true);
      toast("Row manually translated and added to the staging queue.");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not resolve row.", "error");
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      await api.deleteUnparsed(row.id);
      await refresh(true);
      toast("Unparsed row archived out of the queue.", "info");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not archive row.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Translate unparsed row"
      description="The agent refused to guess. Add the missing details manually — nothing is auto-approved."
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => void discard()} loading={busy} icon={<Trash2 size={13} />}>
            Discard row
          </Button>
          <Button size="md" onClick={() => void save()} loading={busy} icon={<Check size={14} />}>
            Add to staging
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-coral-100 bg-coral-50 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-coral-600">
              <AlertCircle size={13} />
              {row.reason}
            </p>
            <Badge tone="danger">{Math.round(row.confidence * 100)}% confidence</Badge>
          </div>
          <pre className="mt-2.5 max-h-24 overflow-auto whitespace-pre-wrap rounded-xl border border-coral-100 bg-white/70 p-2.5 font-mono text-[10px] leading-5 text-ink-600">
            {row.raw_text}
          </pre>
          <p className="mt-2 flex items-center gap-1.5 text-[9px] text-ink-400">
            <ScanLine size={10} />
            {row.source_name} · row {row.source_row ?? "—"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Course title</span>
            <input
              className="input"
              value={form.title}
              placeholder="e.g. Genetics"
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label>
            <span className="label">Course code</span>
            <input
              className="input"
              value={form.course_code}
              placeholder="e.g. BIO 115"
              onChange={(event) => setForm({ ...form, course_code: event.target.value })}
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
                  className={classNames(
                    "h-9 min-w-11 rounded-lg border px-2 text-[11px] font-semibold transition",
                    active
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-ink-200 bg-white text-ink-500 hover:border-ink-300",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="label">Start time</span>
            <input
              type="time"
              className="input"
              value={form.start_time}
              onChange={(event) => setForm({ ...form, start_time: event.target.value })}
            />
          </label>
          <label>
            <span className="label">End time</span>
            <input
              type="time"
              className="input"
              value={form.end_time}
              onChange={(event) => setForm({ ...form, end_time: event.target.value })}
            />
          </label>
          <label>
            <span className="label">Type</span>
            <select
              className="select"
              value={form.event_type}
              onChange={(event) => setForm({ ...form, event_type: event.target.value as EventType })}
            >
              {eventTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Exam / one-off date (optional)</span>
            <input
              type="date"
              className="input"
              value={form.event_date}
              onChange={(event) => setForm({ ...form, event_date: event.target.value })}
            />
          </label>
          <label>
            <span className="label">Room</span>
            <input
              className="input"
              value={form.room}
              placeholder="e.g. Lab 2"
              onChange={(event) => setForm({ ...form, room: event.target.value })}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Section</span>
            <input
              className="input"
              value={form.section}
              onChange={(event) => setForm({ ...form, section: event.target.value })}
            />
          </label>
          <label>
            <span className="label">Instructor</span>
            <input
              className="input"
              value={form.instructor}
              onChange={(event) => setForm({ ...form, instructor: event.target.value })}
            />
          </label>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-ink-100 p-3">
          <input
            type="checkbox"
            checked={form.is_core}
            onChange={(event) => setForm({ ...form, is_core: event.target.checked })}
            className="h-4 w-4 rounded border-ink-300 accent-ink-900"
          />
          <span className="text-[12px] font-medium text-ink-700">Core / mandatory course</span>
        </label>
      </div>
    </Modal>
  );
}
