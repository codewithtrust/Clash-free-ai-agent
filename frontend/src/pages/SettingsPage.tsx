import { useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CalendarOff,
  Check,
  Clock3,
  Globe2,
  GraduationCap,
  Info,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import type { Holiday, Settings } from "../types";
import { Badge, Button, Card, SectionHeading } from "../components/ui";
import { classNames, formatDateRange } from "../lib/utils";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "UTC",
];

type FormState = Settings;

function toForm(settings: Settings): FormState {
  return {
    institution: settings.institution,
    termName: settings.termName,
    termStart: settings.termStart,
    termEnd: settings.termEnd,
    readingWeekStart: settings.readingWeekStart,
    readingWeekEnd: settings.readingWeekEnd,
    timezone: settings.timezone,
    holidays: [...(settings.holidays || [])].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export default function SettingsPage() {
  const { data, refresh, toast } = useApp();
  const [form, setForm] = useState<FormState>(() => toForm(data!.settings));
  const [saved, setSaved] = useState<FormState>(() => toForm(data!.settings));
  const [busy, setBusy] = useState<string | null>(null);
  const [newHoliday, setNewHoliday] = useState<Holiday>({ date: "", name: "" });

  if (!data) return null;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(saved),
    [form, saved],
  );

  const termDays =
    form.termStart && form.termEnd
      ? differenceInCalendarDays(parseISO(form.termEnd), parseISO(form.termStart)) + 1
      : 0;

  const readingWeekDays =
    form.readingWeekStart && form.readingWeekEnd
      ? differenceInCalendarDays(parseISO(form.readingWeekEnd), parseISO(form.readingWeekStart)) + 1
      : 0;

  const teachingDays = Math.max(termDays - readingWeekDays, 0);

  const errors = useMemo(() => {
    const list: string[] = [];
    if (!form.institution.trim()) list.push("Institution name is required.");
    if (!form.termName.trim()) list.push("Term name is required.");
    if (!form.termStart || !form.termEnd) {
      list.push("Both term start and end dates are required.");
    } else if (form.termStart > form.termEnd) {
      list.push("Term end date must be after the start date.");
    }
    if (form.readingWeekStart || form.readingWeekEnd) {
      if (!form.readingWeekStart || !form.readingWeekEnd) {
        list.push("Reading week needs both a start and an end date.");
      } else if (form.readingWeekStart > form.readingWeekEnd) {
        list.push("Reading week end must be after its start.");
      } else if (form.termStart && form.termEnd && (form.readingWeekStart < form.termStart || form.readingWeekEnd > form.termEnd)) {
        list.push("Reading week must fall inside the term.");
      }
    }
    const duplicate = form.holidays.find(
      (holiday, index) => form.holidays.findIndex((item) => item.date === holiday.date) !== index,
    );
    if (duplicate) list.push(`Holiday ${duplicate.date} is listed more than once.`);
    form.holidays.forEach((holiday) => {
      if (!holiday.date || !holiday.name.trim()) list.push("Every holiday needs a date and a name.");
    });
    return Array.from(new Set(list));
  }, [form]);

  const save = async () => {
    if (errors.length) {
      toast(errors[0], "error");
      return;
    }
    setBusy("save");
    try {
      const payload: Settings = {
        ...form,
        institution: form.institution.trim(),
        termName: form.termName.trim(),
        holidays: [...form.holidays]
          .map((holiday) => ({ date: holiday.date, name: holiday.name.trim() }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      };
      const next = await api.saveSettings(payload);
      setForm(toForm(next));
      setSaved(toForm(next));
      await refresh(true);
      toast("Term rules saved. Calendar ranges and exclusions now use these dates.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save settings.", "error");
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setForm(saved);
    setNewHoliday({ date: "", name: "" });
    toast("Unsaved changes discarded.", "info");
  };

  const addHoliday = () => {
    if (!newHoliday.date || !newHoliday.name.trim()) {
      toast("Add a date and name for the holiday.", "error");
      return;
    }
    if (form.holidays.some((holiday) => holiday.date === newHoliday.date)) {
      toast("That date is already a holiday.", "error");
      return;
    }
    update(
      "holidays",
      [...form.holidays, { date: newHoliday.date, name: newHoliday.name.trim() }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
    setNewHoliday({ date: "", name: "" });
  };

  const removeHoliday = (date: string) => {
    update(
      "holidays",
      form.holidays.filter((holiday) => holiday.date !== date),
    );
  };

  const resetDemo = async () => {
    setBusy("demo");
    try {
      await api.resetDemo();
      await refresh(true);
      toast("Demo workspace restored. All events are back in review.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not reset the demo.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <div className="stagger">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Academic rules</p>
            <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-[-0.045em] text-ink-950 sm:text-[32px]">
              Settings
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-ink-500">
              Tell ClashFree how your institution defines the term. These rules drive camera-ready calendar ranges,
              reading-week exclusions, holiday gaps, and clash checks.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="md" onClick={reset} disabled={busy !== null}>
                Discard
              </Button>
            )}
            <Button
              onClick={() => void save()}
              loading={busy === "save"}
              disabled={!dirty || errors.length > 0}
              icon={<Save size={14} />}
            >
              {dirty ? "Save changes" : "All changes saved"}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400/20 text-[#567B22]">
                  <GraduationCap size={19} />
                </span>
                <div>
                  <h2 className="font-display text-[15px] font-bold text-ink-950">Institution & term</h2>
                  <p className="mt-0.5 text-[10px] text-ink-400">The identity and boundaries of this timetable</p>
                </div>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Institution" hint="Shown across the workspace and in exports.">
                  <input
                    className="input"
                    value={form.institution}
                    onChange={(event) => update("institution", event.target.value)}
                    placeholder="Northfield University"
                  />
                </Field>
                <Field label="Term name" hint="Used in calendar titles and the .ics filename.">
                  <input
                    className="input"
                    value={form.termName}
                    onChange={(event) => update("termName", event.target.value)}
                    placeholder="Fall Semester 2026"
                  />
                </Field>
                <Field label="Term start">
                  <input
                    type="date"
                    className="input"
                    value={form.termStart}
                    onChange={(event) => update("termStart", event.target.value)}
                  />
                </Field>
                <Field label="Term end">
                  <input
                    type="date"
                    className="input"
                    value={form.termEnd}
                    onChange={(event) => update("termEnd", event.target.value)}
                  />
                </Field>
                <Field label="Timezone" hint="Display timezone for class times.">
                  <select
                    className="select"
                    value={TIMEZONES.includes(form.timezone) ? form.timezone : "custom"}
                    onChange={(event) => {
                      if (event.target.value !== "custom") update("timezone", event.target.value);
                    }}
                  >
                    {TIMEZONES.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                    {!TIMEZONES.includes(form.timezone) && (
                      <option value="custom">{form.timezone || "Custom timezone"}</option>
                    )}
                  </select>
                </Field>
                <Field label="Custom timezone" hint="IANA name, e.g. Europe/Lisbon.">
                  <input
                    className="input font-mono text-[12px]"
                    value={form.timezone}
                    onChange={(event) => update("timezone", event.target.value)}
                    placeholder="Asia/Kolkata"
                  />
                </Field>
              </div>
              <div className="grid gap-4 border-t border-ink-100 bg-ink-50/40 px-5 py-4 sm:grid-cols-2">
                <Field
                  label={
                    <span className="flex items-center gap-1.5">
                      Reading week start <Badge tone="neutral">Optional</Badge>
                    </span>
                  }
                  hint="No classes are scheduled during reading week."
                >
                  <input
                    type="date"
                    className="input"
                    value={form.readingWeekStart}
                    onChange={(event) => update("readingWeekStart", event.target.value)}
                  />
                </Field>
                <Field label="Reading week end">
                  <input
                    type="date"
                    className="input"
                    value={form.readingWeekEnd}
                    onChange={(event) => update("readingWeekEnd", event.target.value)}
                  />
                </Field>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex flex-col justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral-50 text-coral-500">
                    <CalendarOff size={19} />
                  </span>
                  <div>
                    <h2 className="font-display text-[15px] font-bold text-ink-950">Holidays & closures</h2>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {form.holidays.length} date{form.holidays.length === 1 ? "" : "s"} excluded from the calendar
                    </p>
                  </div>
                </div>
                <Badge tone="lime">{form.holidays.length} exclusions</Badge>
              </div>

              <div className="divide-y divide-ink-100">
                {form.holidays.length === 0 && (
                  <div className="flex items-center gap-3 px-5 py-6 text-[12px] text-ink-400">
                    <Info size={15} />
                    No holidays yet. Classes will recur through every teaching week.
                  </div>
                )}
                {form.holidays.map((holiday) => (
                  <div key={holiday.date} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-50 text-ink-500">
                      <CalendarDays size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-ink-800">{holiday.name}</p>
                      <p className="font-mono text-[10px] text-ink-400">
                        {format(parseISO(holiday.date), "EEE, MMM d, yyyy")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeHoliday(holiday.date)}
                      className="rounded-lg p-1.5 text-ink-400 transition hover:bg-coral-50 hover:text-coral-500"
                      aria-label={`Remove ${holiday.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t border-ink-100 bg-ink-50/40 px-5 py-4">
                <p className="eyebrow mb-2">Add a closure</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="date"
                    className="input sm:w-[190px]"
                    value={newHoliday.date}
                    onChange={(event) => setNewHoliday((current) => ({ ...current, date: event.target.value }))}
                    aria-label="Holiday date"
                  />
                  <input
                    className="input flex-1"
                    value={newHoliday.name}
                    onChange={(event) => setNewHoliday((current) => ({ ...current, name: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addHoliday();
                    }}
                    placeholder="Holiday name, e.g. Founder's Day"
                    aria-label="Holiday name"
                  />
                  <Button variant="secondary" onClick={addHoliday} icon={<Plus size={14} />}>
                    Add holiday
                  </Button>
                </div>
              </div>
            </Card>

            {errors.length > 0 && (
              <div className="rounded-2xl border border-coral-100 bg-coral-50/70 p-4">
                <p className="flex items-center gap-2 text-[11px] font-bold text-coral-600">
                  <TriangleAlert size={13} />
                  Fix before saving
                </p>
                <ul className="mt-2 space-y-1">
                  {errors.map((error) => (
                    <li key={error} className="flex items-start gap-2 text-[11px] leading-5 text-ink-600">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-coral-400" />
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="overflow-hidden bg-ink-950 text-white">
              <div className="border-b border-white/[0.08] px-5 py-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-white/55">Term snapshot</p>
                <div className="mt-1 flex items-center justify-between">
                  <h2 className="font-display text-[15px] font-bold">Rule preview</h2>
                  <Badge tone="dark" className="border-white/10 bg-lime-400/10 text-lime-300">
                    Live
                  </Badge>
                </div>
              </div>
              <div className="space-y-3 p-5">
                <SnapshotRow
                  icon={<CalendarDays size={13} />}
                  label="Term range"
                  value={form.termStart && form.termEnd ? formatDateRange(form.termStart, form.termEnd) : "Not set"}
                />
                <SnapshotRow
                  icon={<Clock3 size={13} />}
                  label="Calendar days"
                  value={`${termDays} days`}
                />
                <SnapshotRow
                  icon={<CalendarOff size={13} />}
                  label="Reading week"
                  value={
                    form.readingWeekStart && form.readingWeekEnd
                      ? `${readingWeekDays} days excluded`
                      : "Not configured"
                  }
                />
                <SnapshotRow
                  icon={<Sparkles size={13} />}
                  label="Teaching days"
                  value={`${teachingDays} days`}
                />
                <SnapshotRow
                  icon={<Globe2 size={13} />}
                  label="Timezone"
                  value={form.timezone || "Not set"}
                />

                <div className="mt-1 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="flex items-center gap-1.5 text-[9px] font-semibold text-lime-300">
                    <ShieldCheck size={11} />
                    Exclusions are enforced at export
                  </p>
                  <p className="mt-1.5 text-[9px] leading-4 text-white/55">
                    Recurring classes are generated only on teaching days. Holidays and reading week are written into
                    the calendar as explicit exclusions, never silent gaps.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeading
                eyebrow="Workspace"
                title="Demo controls"
                description="Restore the seeded timetable, clashes, and quarantined row."
              />
              <p className="mt-3 text-[11px] leading-5 text-ink-500">
                This replaces the current demo source with a fresh copy and resets every approval. Imported sources you
                added yourself are left untouched.
              </p>
              <Button
                className="mt-4 w-full"
                variant="secondary"
                onClick={() => void resetDemo()}
                loading={busy === "demo"}
                disabled={busy !== null}
                icon={<RotateCcw size={14} />}
              >
                Reset demo workspace
              </Button>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Check size={15} className="text-teal-600" />
                <h2 className="font-display text-[14px] font-bold text-ink-950">How rules are used</h2>
              </div>
              <div className="mt-3 space-y-2.5">
                <RuleUse title="Clash detection" body="Compares class streams that meet on the same day." />
                <RuleUse title="Calendar view" body="Hides classes that fall on holidays or reading week." />
                <RuleUse title="ICS / Google sync" body="Adds EXDATE lines and terminates recurrence on the term end." />
              </div>
            </Card>
          </div>
        </div>

        <div
          className={classNames(
            "mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center",
            dirty ? "border-amber-100 bg-amber-50/60" : "border-ink-100 bg-white/70",
          )}
        >
          <div className="flex items-start gap-2.5">
            <span
              className={classNames(
                "flex h-8 w-8 items-center justify-center rounded-xl",
                dirty ? "bg-amber-100 text-amber-600" : "bg-teal-50 text-teal-600",
              )}
            >
              {dirty ? <TriangleAlert size={15} /> : <Check size={15} />}
            </span>
            <div>
              <p className="text-[11px] font-semibold text-ink-800">
                {dirty ? "You have unsaved term rules" : "Term rules are up to date"}
              </p>
              <p className="mt-0.5 text-[9px] text-ink-400">
                {dirty
                  ? "Save to apply these dates to the calendar, clash checks, and exports."
                  : `Applied to every approved event and future sync. Last saved for ${saved.termName}.`}
              </p>
            </div>
          </div>
          {dirty && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={reset} disabled={busy !== null}>
                Discard
              </Button>
              <Button size="sm" onClick={() => void save()} loading={busy === "save"} disabled={errors.length > 0}>
                Save term rules
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[10px] leading-4 text-ink-400">{hint}</span>}
    </label>
  );
}

function SnapshotRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-[10px] text-white/55">
        <span className="text-lime-400/70">{icon}</span>
        {label}
      </span>
      <span className="text-right font-mono text-[9px] font-bold text-white/75">{value}</span>
    </div>
  );
}

function RuleUse({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal-400" />
      <div>
        <p className="text-[10px] font-semibold text-ink-800">{title}</p>
        <p className="mt-0.5 text-[9px] leading-4 text-ink-400">{body}</p>
      </div>
    </div>
  );
}
