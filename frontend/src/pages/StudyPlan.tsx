import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Info,
  Mail,
  Send,
  Sparkles,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { classNames, formatTime } from "../lib/utils";
import { Badge, Button, Card, SectionHeading } from "../components/ui";

export default function StudyPlanPage() {
  const { data, refresh, toast } = useApp();
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!data) return null;
  const { studyPlan, notifications, settings } = data;
  const email = notifications.email;
  const nextBlock = [...studyPlan.blocks].sort((a, b) =>
    `${a.date || ""}${a.start_time}`.localeCompare(`${b.date || ""}${b.start_time}`),
  )[0];

  const sendDigest = async () => {
    setSending(true);
    try {
      const result = await api.sendDigestEmail();
      toast(result.message, result.status === "failed" ? "error" : "success");
      await refresh(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send the digest.", "error");
    } finally {
      setSending(false);
    }
  };

  const downloadStudy = async () => {
    setExporting(true);
    try {
      await api.downloadStudyIcs();
      toast("Study plan exported as an .ics calendar.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not export the study plan.", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <div className="stagger">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-400 transition hover:text-ink-700"
            >
              <ArrowLeft size={12} />
              Back to overview
            </Link>
            <p className="mt-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
              AI study agent · {settings.termName}
            </p>
            <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-[-0.045em] text-ink-950 sm:text-[34px]">
              Your study timetable
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-6 text-ink-500">
              Derived from the timetable you uploaded: one focused hour per subject, timed for the day before that
              subject next meets.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" icon={<Download size={14} />} onClick={() => void downloadStudy()} loading={exporting}>
              Export .ics
            </Button>
            <Button icon={<Send size={14} />} onClick={() => void sendDigest()} loading={sending}>
              Email digest
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile
            icon={<CalendarClock size={17} />}
            label="Subjects covered"
            value={String(studyPlan.summary.courses)}
            note={studyPlan.summary.coverage}
            accent="lime"
          />
          <SummaryTile
            icon={<Clock3 size={17} />}
            label="Weekly study hours"
            value={`${studyPlan.summary.hours}h`}
            note="One 60-minute block per subject"
            accent="teal"
          />
          <SummaryTile
            icon={<CalendarDays size={17} />}
            label="Study days"
            value={String(studyPlan.summary.studyDays.length)}
            note={studyPlan.summary.studyDays.join(" · ") || "Upload a timetable"}
            accent="ink"
          />
          <SummaryTile
            icon={<CheckCircle2 size={17} />}
            label="Next block"
            value={nextBlock ? `${nextBlock.day} ${nextBlock.start_time}` : "—"}
            note={nextBlock ? `${nextBlock.course_code} · ${nextBlock.course_title}` : "No blocks yet"}
            accent="coral"
          />
        </div>

        <Card className="mt-4 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
            <SectionHeading
              eyebrow="Weekly board"
              title="Study blocks by day"
              description="Each block avoids your class slots, other study blocks, holidays and reading week."
            />
            <Badge tone="lime">
              <Sparkles size={10} />
              Auto-generated
            </Badge>
          </div>

          {studyPlan.blocks.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-[13px] font-semibold text-ink-800">No study blocks yet</p>
              <p className="mt-1 text-[12px] text-ink-500">Upload your timetable and the agent will fill this board.</p>
              <Link
                to="/sources"
                className="mt-3 inline-flex h-9 items-center rounded-xl bg-ink-900 px-4 text-[12px] font-semibold text-white"
              >
                Import a timetable
              </Link>
            </div>
          ) : (
            <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {studyPlan.byDay.map((day) => (
                <div
                  key={day.day}
                  className={classNames(
                    "rounded-2xl border p-2.5",
                    day.blocks.length ? "border-ink-100 bg-ink-50/45" : "border-dashed border-ink-100 bg-white",
                  )}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-400">{day.label}</p>
                    <span className="font-mono text-[9px] text-ink-400">{day.blocks.length || "—"}</span>
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {day.blocks.length === 0 ? (
                      <p className="px-1 py-3 text-[10px] leading-4 text-ink-400">No class prep needed. Rest or catch up.</p>
                    ) : (
                      day.blocks.map((block) => (
                        <article
                          key={block.id}
                          className="rounded-xl border border-ink-100 bg-white p-2.5 shadow-[0_1px_0_rgba(13,20,17,.03)]"
                        >
                          <p className="font-mono text-[9px] font-semibold text-teal-600">
                            {formatTime(block.start_time)}–{formatTime(block.end_time)}
                          </p>
                          <p className="mt-0.5 truncate text-[12px] font-bold text-ink-950">{block.course_code}</p>
                          <p className="truncate text-[9px] text-ink-400">{block.course_title}</p>
                          <p className="mt-1 flex items-start gap-1 text-[9px] leading-4 text-ink-500">
                            <CalendarClock size={9} className="mt-0.5 shrink-0" />
                            {block.anchor}
                          </p>
                          {block.exam && (
                            <p className="mt-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[8px] font-semibold text-amber-600">
                              Exam {block.exam.date}
                            </p>
                          )}
                        </article>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-ink-100 px-5 py-4">
              <SectionHeading
                eyebrow="Subject coverage"
                title="Class and study pairing"
                description="Every verified subject gets a study block tied to its real class day."
              />
            </div>
            <div
              className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
              tabIndex={0}
              role="region"
              aria-label="Class and study pairing table"
            >
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/50">
                    <th scope="col" className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
                      Subject
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
                      Class
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
                      Study block
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
                      Focus
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {notifications.courses.map((course) => (
                    <tr key={course.course_code} className="align-top">
                      <td className="px-5 py-3">
                        <p className="font-mono text-[10px] font-bold text-ink-700">{course.course_code}</p>
                        <p className="mt-0.5 text-[11px] font-semibold text-ink-900">{course.title}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone={course.is_core ? "lime" : "neutral"}>{course.is_core ? "Core" : "Elective"}</Badge>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-ink-500">
                        <p className="font-semibold text-ink-700">{course.class_days.join(", ")}</p>
                        <p className="mt-0.5">{course.class_time}</p>
                        <p className="mt-0.5">{course.room}</p>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-ink-500">
                        <p className="font-semibold text-teal-700">{course.study_day}</p>
                        <p className="mt-0.5 font-mono text-[10px]">{course.study_time}</p>
                        <p className="mt-0.5 text-[10px] text-ink-400">{course.anchor}</p>
                      </td>
                      <td className="px-5 py-3 text-[11px] leading-5 text-ink-500">{course.focus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                    <Mail size={17} />
                  </span>
                  <div>
                    <p className="eyebrow">Notification digest</p>
                    <h2 className="font-display text-[15px] font-bold text-ink-950">Email about your subjects</h2>
                  </div>
                </div>
                <Badge tone="neutral">{email.courseCount} subjects</Badge>
              </div>
              <div className="p-5">
                <p className="text-[12px] font-semibold text-ink-900">{email.subject}</p>
                <p className="mt-1 text-[10px] text-ink-400">
                  To {email.to} · from {email.from}
                </p>
                <pre
                  className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ink-100 bg-ink-50/50 p-3 font-sans text-[11px] leading-5 text-ink-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
                  tabIndex={0}
                  aria-label="Email digest preview"
                >
                  {email.text}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" icon={<Send size={13} />} onClick={() => void sendDigest()} loading={sending}>
                    Send digest
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download size={13} />}
                    onClick={() => void api.downloadDigest().catch((error) => toast(String(error), "error"))}
                  >
                    Download .eml
                  </Button>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-ink-400">
                  Without SMTP credentials the digest is saved to the local outbox, so you can still inspect exactly what
                  the agent would send.
                </p>
              </div>
            </Card>

            <Card className="overflow-hidden bg-ink-950 p-5 text-white">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-lime-400/20 bg-lime-400/10 text-lime-300">
                  <Info size={15} />
                </span>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/55">How it is built</p>
                  <p className="font-display text-[14px] font-bold">Deterministic by design</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-white/60">{studyPlan.methodology}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
                <div>
                  <p className="font-display text-[17px] font-extrabold text-lime-300">{studyPlan.basedOn.events}</p>
                  <p className="text-[8px] uppercase tracking-[0.1em] text-white/50">events read</p>
                </div>
                <div>
                  <p className="font-display text-[17px] font-extrabold text-white">{studyPlan.summary.minutes}m</p>
                  <p className="text-[8px] uppercase tracking-[0.1em] text-white/50">study time</p>
                </div>
                <div>
                  <p className="font-display text-[17px] font-extrabold text-white">{studyPlan.summary.excludedDates}</p>
                  <p className="text-[8px] uppercase tracking-[0.1em] text-white/50">dates excluded</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  accent: "lime" | "teal" | "ink" | "coral";
}) {
  const tones = {
    lime: "bg-lime-400/20 text-[#567B22]",
    teal: "bg-teal-50 text-teal-600",
    ink: "bg-ink-50 text-ink-600",
    coral: "bg-coral-50 text-coral-600",
  }[accent];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <span className={classNames("flex h-9 w-9 items-center justify-center rounded-xl", tones)}>{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">{label}</span>
      </div>
      <p className="mt-3 font-display text-[24px] font-extrabold leading-none tracking-[-0.05em] text-ink-950">
        {value}
      </p>
      <p className="mt-1.5 text-[10px] text-ink-400">{note}</p>
    </Card>
  );
}
