import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Globe2,
  Image,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Server,
  Sparkles,
  Trash2,
  UploadCloud,
  Waypoints,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { api, type IngestResponse } from "../lib/api";
import type { RunStats } from "../types";
import { classNames, formatDateRange, relativeTime } from "../lib/utils";
import { Badge, Button, Card, EmptyState, Modal } from "../components/ui";

const PROCESS_STEPS = [
  { label: "Mapping source trace", detail: "Creating a stable trace ID" },
  { label: "Reading rows", detail: "Normalizing course, time, room" },
  { label: "Partitioning outcomes", detail: "Verified · clashes · unparsed" },
  { label: "Scanning for collisions", detail: "Core labs vs elected streams" },
];

export default function SourcesPage() {
  const { data, refresh, toast } = useApp();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [processingStep, setProcessingStep] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [lastResult, setLastResult] = useState<IngestResponse | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!busy) {
      setProcessingStep(0);
      return;
    }
    const timer = window.setInterval(() => {
      setProcessingStep((current) => Math.min(current + 1, PROCESS_STEPS.length - 1));
    }, 1300);
    return () => window.clearInterval(timer);
  }, [busy]);

  if (!data) return null;
  const { sources, runs, settings } = data;

  const ingestFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      toast("That file is over the 15 MB limit.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await api.upload(file);
      setLastResult(result);
      setResultOpen(true);
      await refresh(true);
      toast(`Parsed ${result.stats.parsed} rows from ${file.name}.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not read that file.", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const ingestUrl = async () => {
    if (!url.trim()) {
      toast("Paste a timetable or exam portal URL first.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await api.ingestUrl(url.trim());
      setLastResult(result);
      setResultOpen(true);
      setUrl("");
      await refresh(true);
      toast(`Imported ${result.stats.parsed} rows from the web source.`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not scrape that URL.", "error");
    } finally {
      setBusy(false);
    }
  };

  const reprocess = async (sourceId: string) => {
    setReprocessing(sourceId);
    try {
      const result = await api.reprocess(sourceId);
      setLastResult(result);
      setResultOpen(true);
      await refresh(true);
      toast("Source re-run complete. Only changed events were updated.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not re-run source.", "error");
    } finally {
      setReprocessing(null);
    }
  };

  const removeSource = async (sourceId: string, name: string) => {
    if (!window.confirm(`Remove “${name}” and its staged events? This does not touch a synced calendar.`)) return;
    try {
      await api.deleteSource(sourceId);
      await refresh(true);
      toast("Source and staged events removed.", "info");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not remove source.", "error");
    }
  };

  const resetDemo = async () => {
    if (!window.confirm("Reset the demo timetable to its original state?")) return;
    setBusy(true);
    try {
      await api.resetDemo();
      await refresh(true);
      toast("Demo source reset. Approvals and clashes were recalculated.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not reset demo.", "error");
    } finally {
      setBusy(false);
    }
  };

  const copyTrace = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast("Trace ID copied.");
    } catch {
      toast("Could not copy trace ID.", "error");
    }
  };

  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <div className="stagger">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Source registry</p>
              <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-[-0.045em] text-ink-950 sm:text-[32px]">
                Sources & ingestion
              </h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-6 text-ink-500">
                Upload a document or give the agent a portal URL. Every run creates a trace and a diffable snapshot.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={api.sampleUrl}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 text-[12px] font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                <Download size={14} />
                Sample file
              </a>
              <Button variant="secondary" onClick={() => void resetDemo()} loading={busy} icon={<RotateCcw size={14} />}>
                Reset demo
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <div>
                  <p className="eyebrow">Ingest</p>
                  <h2 className="mt-1 font-display text-[15px] font-bold text-ink-950">Bring in a timetable</h2>
                </div>
                <Badge tone="success" dot>
                  Trace enabled
                </Badge>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void ingestFile(event.dataTransfer.files[0]);
                  }}
                  className={classNames(
                    "flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition",
                    dragging
                      ? "border-teal-500 bg-teal-50/70"
                      : "border-ink-200 bg-ink-50/30 hover:border-ink-300 hover:bg-ink-50/70",
                  )}
                  onClick={() => inputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(event) => void ingestFile(event.target.files?.[0])}
                  />
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-ink-600 shadow-soft">
                    <UploadCloud size={22} />
                  </span>
                  <p className="mt-3 text-[12px] font-bold text-ink-800">Drop a timetable here</p>
                  <p className="mt-1 text-[10px] leading-4 text-ink-400">
                    PDF, screenshot, CSV, TXT or JSON · 15 MB max
                  </p>
                  <span className="mt-3 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-ink-600">
                    Browse files
                  </span>
                </div>

                <div className="flex flex-col justify-center rounded-2xl border border-ink-100 p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                      <Globe2 size={15} />
                    </span>
                    <p className="text-[12px] font-bold text-ink-800">Scrape a live page</p>
                  </div>
                  <label className="mt-3">
                    <span className="label">Timetable or exam portal URL</span>
                    <div className="relative">
                      <Link2 size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                      <input
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void ingestUrl();
                        }}
                        placeholder="https://university.edu/timetable"
                        className="input pl-8"
                        type="url"
                      />
                    </div>
                  </label>
                  <Button className="mt-3 w-full" size="md" onClick={() => void ingestUrl()} loading={busy} icon={<Play size={13} />}>
                    Run ingestion agent
                  </Button>
                  <p className="mt-2.5 text-[9px] leading-4 text-ink-400">
                    HTTP + BeautifulSoup by default. Playwright is used for dynamic pages when enabled.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink-100 bg-ink-50/40 px-5 py-2.5 text-[9px] text-ink-400">
                <span className="inline-flex items-center gap-1.5">
                  <LockIcon />
                  Source stored locally
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ScanLine size={10} />
                  Confidence gate 45%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles size={10} className="text-lime-500" />
                  {data.dashboard.agent.engine}
                </span>
              </div>
            </Card>

            <Card className="flex flex-col p-5">
              <p className="eyebrow">Agent pipeline</p>
              <h2 className="mt-1 font-display text-[15px] font-bold text-ink-950">Five safe stages</h2>
              <div className="mt-4 flex-1 space-y-0">
                {data.dashboard.agent.stages.map((stage, index) => (
                  <div key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < data.dashboard.agent.stages.length - 1 && (
                      <span className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-px bg-ink-100" />
                    )}
                    <span
                      className={classNames(
                        "relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[8px] font-bold",
                        index === 4
                          ? "border-lime-400 bg-lime-400 text-ink-950"
                          : "border-ink-200 bg-white text-ink-500",
                      )}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-ink-800">{stage.label}</p>
                      <p className="mt-0.5 text-[9px] leading-4 text-ink-400">{stage.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                <p className="text-[9px] font-semibold text-ink-600">
                  {settings.termName} · {formatDateRange(settings.termStart, settings.termEnd)}
                </p>
                <p className="mt-0.5 text-[8px] text-ink-400">{settings.institution}</p>
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <div>
                  <p className="eyebrow">Registered sources</p>
                  <h2 className="mt-1 font-display text-[15px] font-bold text-ink-950">
                    {sources.length} source{sources.length === 1 ? "" : "s"}
                  </h2>
                </div>
                <Badge tone="neutral">{data.summary.events} staged events</Badge>
              </div>
              {sources.length === 0 ? (
                <EmptyState
                  icon={<Database size={20} />}
                  title="No sources yet"
                  body="Drop a timetable or paste a portal URL. ClashFree will do the rest."
                />
              ) : (
                <div className="divide-y divide-ink-50">
                  {sources.map((source) => {
                    const latest = runs.find((run) => run.source_id === source.id);
                    const stats = latest?.stats || source.last_stats;
                    return (
                      <div key={source.id} className="group px-4 py-4 transition hover:bg-ink-50/30 sm:px-5">
                        <div className="flex items-start gap-3">
                          <span
                            className={classNames(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                              source.kind === "url"
                                ? "bg-teal-50 text-teal-600"
                                : source.kind === "demo"
                                  ? "bg-lime-400/20 text-[#567B22]"
                                  : "bg-ink-50 text-ink-600",
                            )}
                          >
                            {source.kind === "url" ? (
                              <Globe2 size={16} />
                            ) : source.kind === "demo" ? (
                              <Sparkles size={16} />
                            ) : (
                              <FileText size={16} />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="max-w-[260px] truncate text-[12px] font-semibold text-ink-900">{source.name}</p>
                              <SourceStatus status={source.status} />
                              <Badge tone="neutral">{source.kind}</Badge>
                            </div>
                            <p className="mt-0.5 truncate text-[9px] text-ink-400">
                              {source.kind === "url" ? source.location : `Local file · ${source.location.split(/[\\/]/).pop()}`}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-ink-400">
                              <span className="inline-flex items-center gap-1">
                                <Database size={9} />
                                {source.event_count} events
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <FileArchive size={9} />
                                {source.unparsed_count} unparsed
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <RefreshCw size={9} />
                                {source.run_count} run{source.run_count === 1 ? "" : "s"}
                              </span>
                              {latest && <span>Updated {relativeTime(latest.started_at)}</span>}
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyTrace(source.trace_id)}
                              className="mt-2 inline-flex items-center gap-1 rounded-md bg-ink-50 px-1.5 py-0.5 font-mono text-[8px] text-ink-400 transition hover:text-ink-700"
                              title="Copy trace ID"
                            >
                              <Clipboard size={8} />
                              {source.trace_id}
                            </button>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {source.kind === "url" && (
                              <a
                                href={source.location}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg p-2 text-ink-400 transition hover:bg-white hover:text-ink-800"
                                aria-label="Open source URL"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => void reprocess(source.id)}
                              className="rounded-lg p-2 text-ink-400 transition hover:bg-white hover:text-ink-800 disabled:opacity-50"
                              aria-label="Re-run source"
                              disabled={reprocessing === source.id}
                            >
                              <RefreshCw size={14} className={reprocessing === source.id ? "animate-spin" : ""} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeSource(source.id, source.name)}
                              className="rounded-lg p-2 text-ink-400 transition hover:bg-coral-50 hover:text-coral-500"
                              aria-label="Remove source"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {stats && (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-ink-100 bg-white px-3 py-2">
                            <span className="mr-1 text-[8px] font-bold uppercase tracking-[0.1em] text-ink-500">
                              Last delta
                            </span>
                            <DeltaChip value={stats.new} label="new" tone="teal" />
                            <DeltaChip value={stats.updated} label="changed" tone="amber" />
                            <DeltaChip value={stats.unchanged} label="unchanged" tone="neutral" />
                            <DeltaChip value={stats.unparsed} label="held" tone="coral" />
                            <span className="ml-auto font-mono text-[8px] text-ink-500">{stats.engine}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <div>
                  <p className="eyebrow">Run history</p>
                  <h2 className="mt-1 font-display text-[15px] font-bold text-ink-950">Trace ledger</h2>
                </div>
                <Badge tone="neutral">{runs.length} runs</Badge>
              </div>
              {runs.length === 0 ? (
                <EmptyState icon={<Waypoints size={20} />} title="No runs yet" body="Every ingestion produces an auditable run record." />
              ) : (
                <div className="max-h-[520px] divide-y divide-ink-50 overflow-y-auto">
                  {runs.map((run) => (
                    <div key={run.id} className="px-4 py-3.5 sm:px-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold text-ink-800">{run.source_name}</p>
                        <span className="shrink-0 text-[9px] text-ink-400">{relativeTime(run.started_at)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-ink-400">
                        <span className="inline-flex items-center gap-1 text-teal-600">
                          <CheckCircle2 size={9} />
                          {run.status}
                        </span>
                        <span>·</span>
                        <span>{run.engine || "auto"}</span>
                        <span>·</span>
                        <span>{run.stats?.parsed ?? 0} parsed</span>
                        <span>·</span>
                        <span>{run.stats?.clashes ?? 0} clashes</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyTrace(run.trace_id)}
                        className="mt-1.5 inline-flex items-center gap-1 font-mono text-[8px] text-ink-500 transition hover:text-ink-700"
                      >
                        <Clipboard size={8} />
                        {run.trace_id}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="mt-4 rounded-2xl border border-ink-100 bg-white/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Waypoints size={15} />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-ink-800">100% traceability alignment</p>
                  <p className="mt-0.5 text-[9px] leading-4 text-ink-400">
                    Source → run → event → export. Every row includes a trace ID stamp and source-row evidence.
                  </p>
                </div>
              </div>
              <Link to="/review" className="inline-flex items-center gap-1 text-[10px] font-semibold text-teal-600 hover:text-teal-500">
                Inspect staged events
                <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={busy}
        onClose={() => undefined}
        title="Agent is reading your schedule"
        description="This can take a moment for scanned PDFs and live pages."
      >
        <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-ink-50/60 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-lime-400">
            <LoaderCircle size={18} className="animate-spin" />
          </span>
          <div>
            <p className="text-[12px] font-bold text-ink-900">{PROCESS_STEPS[processingStep].label}</p>
            <p className="mt-0.5 text-[10px] text-ink-400">{PROCESS_STEPS[processingStep].detail}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {PROCESS_STEPS.map((step, index) => (
            <div key={step.label} className="flex items-center gap-2.5">
              <span
                className={classNames(
                  "flex h-5 w-5 items-center justify-center rounded-full border",
                  index < processingStep
                    ? "border-teal-500 bg-teal-500 text-white"
                    : index === processingStep
                      ? "border-ink-900 bg-ink-900 text-lime-400"
                      : "border-ink-200 bg-white text-ink-300",
                )}
              >
                {index < processingStep ? <Check size={10} strokeWidth={3} /> : <span className="text-[8px]">{index + 1}</span>}
              </span>
              <span className={classNames("text-[10px]", index <= processingStep ? "font-medium text-ink-700" : "text-ink-400")}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </Modal>

      <IngestResultModal result={lastResult} open={resultOpen} onClose={() => setResultOpen(false)} />
    </>
  );
}

function IngestResultModal({
  result,
  open,
  onClose,
}: {
  result: IngestResponse | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!result) return null;
  const stats: RunStats | null = result.stats;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run receipt"
      description={`${result.source.name} was mapped to ${stats?.traceId || result.run.id}.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Link
            to="/review"
            onClick={onClose}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink-900 px-4 text-[13px] font-semibold text-white transition hover:bg-ink-800"
          >
            Review staged items
            <ArrowRight size={13} />
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ResultStat value={stats?.new ?? 0} label="New" tone="teal" />
        <ResultStat value={stats?.updated ?? 0} label="Changed" tone="amber" />
        <ResultStat value={stats?.unparsed ?? 0} label="Held" tone="coral" />
        <ResultStat value={stats?.clashes ?? 0} label="Clashes" tone="coral" />
      </div>
      <div className="mt-4 rounded-2xl border border-ink-100 bg-ink-50/50 p-4">
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-ink-700">
          <Waypoints size={12} />
          Trace summary
        </p>
        <div className="mt-2 space-y-1.5 font-mono text-[9px] text-ink-500">
          <p>source: {result.source.id}</p>
          <p>trace: {stats?.traceId || result.run.id}</p>
          <p>engine: {stats?.engine || "deterministic"}</p>
          <p>parsed: {stats?.parsed ?? 0} · unchanged: {stats?.unchanged ?? 0} · removed: {stats?.removed ?? 0}</p>
        </div>
      </div>
      {stats?.changes && stats.changes.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold text-ink-700">Delta preview</p>
          <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
            {stats.changes.slice(0, 8).map((change, index) => (
              <div key={index} className="flex items-center gap-2 rounded-lg border border-ink-100 px-2.5 py-1.5">
                <Badge tone={change.type === "new" ? "success" : change.type === "updated" ? "warning" : "danger"}>
                  {change.type}
                </Badge>
                <span className="truncate text-[10px] text-ink-600">{change.title}</span>
                <span className="ml-auto shrink-0 text-[8px] text-ink-400">{change.fields.join(", ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function ResultStat({ value, label, tone }: { value: number; label: string; tone: "teal" | "amber" | "coral" }) {
  const styles = {
    teal: "bg-teal-50 text-teal-600",
    amber: "bg-amber-50 text-amber-600",
    coral: "bg-coral-50 text-coral-600",
  }[tone];
  return (
    <div className={classNames("rounded-xl px-3 py-2.5", styles)}>
      <p className="font-display text-[22px] font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.1em] opacity-70">{label}</p>
    </div>
  );
}

function SourceStatus({ status }: { status: string }) {
  const tone = status === "ready" ? "success" : status === "review" ? "warning" : status === "error" ? "danger" : "neutral";
  return (
    <Badge tone={tone} dot>
      {status}
    </Badge>
  );
}

function DeltaChip({ value, label, tone }: { value: number; label: string; tone: "teal" | "amber" | "neutral" | "coral" }) {
  const styles = {
    teal: "bg-teal-50 text-teal-600",
    amber: "bg-amber-50 text-amber-600",
    neutral: "bg-ink-50 text-ink-500",
    coral: "bg-coral-50 text-coral-600",
  }[tone];
  return (
    <span className={classNames("rounded-md px-1.5 py-0.5 text-[8px] font-bold", styles)}>
      {value} {label}
    </span>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
