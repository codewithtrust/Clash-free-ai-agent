import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  Clipboard,
  CloudDownload,
  Download,
  ExternalLink,
  FileKey2,
  KeyRound,
  LockKeyhole,
  Mail,
  Plug,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Unplug,
  Zap,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../lib/api";
import type { Health } from "../types";
import { classNames, formatDateRange, relativeTime } from "../lib/utils";
import { Badge, Button, Card } from "../components/ui";
import { SyncModal } from "../components/SyncModal";

export default function IntegrationsPage() {
  const { data, refresh, toast } = useApp();
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  useEffect(() => {
    api.health().then(setHealth).catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (google === "connected") {
      toast("Google Calendar connected. Human approval is still required.");
      void refresh(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (google === "error") {
      toast(params.get("message") || "Google connection failed.", "error");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refresh, toast]);

  if (!data) return null;
  const google = data.google;
  const approved = data.sync.approved;

  const connectGoogle = async () => {
    setBusy("connect");
    try {
      const result = await api.googleAuthUrl();
      window.location.href = result.url;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not start Google OAuth.", "error");
      setBusy(null);
    }
  };

  const syncGoogle = async () => {
    setBusy("sync");
    try {
      const result = await api.googleSync();
      await refresh(true);
      toast(result.message);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Google sync failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("ics");
    try {
      await api.downloadIcs();
      await refresh(true);
      toast("Calendar exported. Import it into any calendar app.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not export calendar.", "error");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied.`);
    } catch {
      toast("Could not copy to clipboard.", "error");
    }
  };

  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <div className="stagger">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Destinations</p>
              <h1 className="mt-2 font-display text-[28px] font-extrabold tracking-[-0.045em] text-ink-950 sm:text-[32px]">
                Integrations
              </h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-6 text-ink-500">
                Push approved events to Google Calendar, export a standards-compliant .ics file, or connect the AI
                extraction engine.
              </p>
            </div>
            <Button onClick={() => setSyncOpen(true)} icon={<ShieldCheck size={14} />}>
              Review & sync
            </Button>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <div className="flex flex-col justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F0FE] text-[#3D6FD6]">
                      <CalendarCheck size={19} />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-[15px] font-bold text-ink-950">Google Calendar</h2>
                        {google.connected ? (
                          <Badge tone="success" dot>
                            Connected
                          </Badge>
                        ) : google.configured ? (
                          <Badge tone="warning" dot>
                            Not connected
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Setup needed</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {google.connected
                          ? "Idempotent event write with stable fingerprints"
                          : "OAuth connection for direct calendar writes"}
                      </p>
                    </div>
                  </div>
                  {google.connected ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void syncGoogle()}
                      loading={busy === "sync"}
                      icon={<RefreshCw size={12} />}
                    >
                      Sync approved
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void connectGoogle()}
                      loading={busy === "connect"}
                      disabled={!google.configured}
                      icon={<Plug size={12} />}
                    >
                      Connect Google
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr]">
                  <div>
                    <p className="eyebrow">Sync behaviour</p>
                    <div className="mt-3 space-y-2.5">
                      <Feature
                        ok
                        title="Recurring weekly events"
                        body="Each class stream becomes one recurring Google event with room and instructor metadata."
                      />
                      <Feature
                        ok
                        title="No duplicate blocks"
                        body="Events are matched by a private ClashFree ID and updated in place on re-run."
                      />
                      <Feature
                        ok
                        title="Reading-week exclusions"
                        body="Institution holidays and reading week are encoded as exclusions."
                      />
                      <Feature
                        ok={google.connected}
                        title="Human approval required"
                        body="Google writes only begin after you press Approve & sync."
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-ink-100 bg-ink-50/50 p-4">
                    <p className="eyebrow">Connection</p>
                    {google.connected ? (
                      <>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                            <Check size={15} />
                          </span>
                          <div>
                            <p className="text-[11px] font-semibold text-ink-800">OAuth token active</p>
                            <p className="text-[9px] text-ink-400">{google.account || "Google account linked"}</p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-2">
                          <InfoRow label="Approved events" value={String(approved)} />
                          <InfoRow label="Destination" value="Primary calendar" />
                          <InfoRow
                            label="Last sync"
                            value={data.dashboard.lastSync ? relativeTime(data.dashboard.lastSync.created_at) : "Never"}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void connectGoogle()}
                          className="mt-4 inline-flex items-center gap-1 text-[9px] font-semibold text-teal-600 hover:text-teal-500"
                        >
                          Re-authorize account
                          <ExternalLink size={9} />
                        </button>
                      </>
                    ) : google.configured ? (
                      <>
                        <p className="mt-2 text-[11px] leading-5 text-ink-500">
                          OAuth client is configured. Connect the account you want ClashFree to write to.
                        </p>
                        <Button className="mt-4 w-full" size="sm" onClick={() => void connectGoogle()} loading={busy === "connect"}>
                          Authorize Google Calendar
                        </Button>
                        <p className="mt-2 text-[8px] leading-4 text-ink-400">
                          Permission scope: calendar.events. ClashFree never reads your email.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2 text-[11px] leading-5 text-ink-500">
                          Add a Google OAuth client to enable direct sync. Until then, use the .ics export — it works
                          everywhere.
                        </p>
                        <div className="mt-3 space-y-1.5">
                          {google.missing.map((key) => (
                            <div key={key} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5">
                              <code className="font-mono text-[9px] text-ink-600">{key}</code>
                              <span className="text-[8px] font-semibold uppercase tracking-wider text-amber-600">
                                missing
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {!google.configured && (
                  <div className="border-t border-ink-100 bg-amber-50/40 px-5 py-4">
                    <div className="flex items-start gap-2.5">
                      <FileKey2 size={15} className="mt-0.5 shrink-0 text-amber-600" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-amber-600">Google OAuth setup</p>
                        <p className="mt-1 text-[9px] leading-4 text-ink-500">
                          Add credentials to <code className="font-mono">backend/.env</code>, then restart the API.
                          Add the redirect URI below to your Google Cloud OAuth client.
                        </p>
                        <CopyField
                          value={google.redirectUri}
                          label="Redirect URI"
                          onCopy={() => void copy(google.redirectUri, "Redirect URI")}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="flex flex-col justify-between gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400/20 text-[#567B22]">
                      <CloudDownload size={19} />
                    </span>
                    <div>
                      <h2 className="font-display text-[15px] font-bold text-ink-950">Calendar file (.ics)</h2>
                      <p className="mt-0.5 text-[10px] text-ink-400">Universal export · Google, Outlook, Apple</p>
                    </div>
                  </div>
                  <Badge tone="success">Always available</Badge>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="neutral">{approved} approved</Badge>
                      <Badge tone="neutral">{data.sync.recurring} recurring</Badge>
                      <Badge tone="neutral">{data.sync.exams} exams</Badge>
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-ink-500">
                      Downloads an RFC 5545 calendar with stable UIDs, trace IDs, room allocations, holiday exclusions,
                      and exact recurrence rules for {formatDateRange(data.settings.termStart, data.settings.termEnd)}.
                    </p>
                    {approved === 0 && (
                      <p className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-amber-600">
                        <TriangleAlert size={11} />
                        Approve events first to export a calendar.
                      </p>
                    )}
                  </div>
                  <Button
                    size="md"
                    onClick={() => void download()}
                    loading={busy === "ics"}
                    disabled={approved === 0}
                    icon={<Download size={14} />}
                  >
                    Download .ics
                  </Button>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFF4FC] text-[#3D6196]">
                      <Mail size={19} />
                    </span>
                    <div>
                      <h2 className="font-display text-[15px] font-bold text-ink-950">Microsoft Outlook</h2>
                      <p className="mt-0.5 text-[10px] text-ink-400">Microsoft Graph calendar integration</p>
                    </div>
                  </div>
                  <Badge tone="neutral">Planned</Badge>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-ink-500">
                  The .ics export already imports cleanly into Outlook and Microsoft 365. Native Graph sync with
                  idempotent updates is on the roadmap.
                </p>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="overflow-hidden bg-ink-950 text-white">
                <div className="border-b border-white/[0.08] px-5 py-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-white/55">Extraction engine</p>
                  <div className="mt-1 flex items-center justify-between">
                    <h2 className="font-display text-[15px] font-bold">AI reader</h2>
                    <Badge
                      tone="dark"
                      className={classNames(
                        "border-white/10",
                        health?.capabilities.multimodalAI ? "bg-lime-400/10 text-lime-300" : "bg-white/5 text-white/50",
                      )}
                    >
                      {health?.capabilities.multimodalAI ? "Multimodal" : "Rules engine"}
                    </Badge>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-3">
                    <span
                      className={classNames(
                        "flex h-10 w-10 items-center justify-center rounded-xl",
                        health?.capabilities.multimodalAI
                          ? "bg-lime-400/15 text-lime-300"
                          : "bg-white/[0.06] text-white/55",
                      )}
                    >
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <p className="text-[12px] font-semibold">
                        {health?.capabilities.multimodalAI ? "OpenAI multimodal extraction" : "Deterministic parser"}
                      </p>
                      <p className="font-mono text-[9px] text-white/55">
                        {health?.capabilities.model || "local-rules-v1"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] leading-5 text-white/55">
                    {health?.capabilities.multimodalAI
                      ? "Messy screenshots, low-quality scans and mixed PDF layouts are read by the multimodal model, then gated by confidence."
                      : "Clean text, CSV, JSON and text-based PDFs are handled locally with no API key. Add OPENAI_API_KEY for screenshots and messy scans."}
                  </p>
                  <div className="mt-4 space-y-2 border-t border-white/[0.08] pt-3">
                    <DarkRow label="Deterministic fallback" value="Always on" ok />
                    <DarkRow label="Confidence gate" value="45%" ok />
                    <DarkRow
                      label="Multimodal model"
                      value={health?.capabilities.multimodalAI ? "Configured" : "Not configured"}
                      ok={Boolean(health?.capabilities.multimodalAI)}
                    />
                  </div>
                  {!health?.capabilities.multimodalAI && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                      <p className="flex items-center gap-1.5 text-[9px] font-semibold text-white/60">
                        <KeyRound size={11} className="text-lime-400" />
                        Add a key to enable image OCR
                      </p>
                      <code className="mt-1.5 block break-all font-mono text-[8px] leading-4 text-white/55">
                        OPENAI_API_KEY=sk-…
                      </code>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-teal-600" />
                  <h2 className="font-display text-[14px] font-bold text-ink-950">Write safety</h2>
                </div>
                <div className="mt-3 space-y-3">
                  <SafetyRow
                    number="01"
                    title="Human approval gate"
                    body="No calendar provider receives a write until you explicitly approve and sync."
                  />
                  <SafetyRow
                    number="02"
                    title="Idempotent updates"
                    body="A stable event fingerprint prevents duplicate blocks when a timetable is revised."
                  />
                  <SafetyRow
                    number="03"
                    title="Traceable exports"
                    body="Every external event carries its ClashFree event ID, trace ID and source ID."
                  />
                </div>
              </Card>

              <Card className="p-5">
                <p className="eyebrow">Environment</p>
                <div className="mt-3 space-y-2">
                  <ConfigRow label="Backend" value="FastAPI · SQLite" ok />
                  <ConfigRow label="AI reader" value={health?.capabilities.multimodalAI ? "OpenAI" : "Local rules"} ok />
                  <ConfigRow label="Google OAuth" value={google.configured ? "Configured" : "Not configured"} ok={google.configured} />
                  <ConfigRow label=".ics export" value="Ready" ok />
                </div>
                <button
                  type="button"
                  onClick={() => void refresh(true)}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-200 py-2 text-[10px] font-semibold text-ink-600 transition hover:bg-ink-50"
                >
                  <RefreshCw size={11} />
                  Re-check integrations
                </button>
              </Card>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl border border-ink-100 bg-white/70 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-lime-400/20 text-[#567B22]">
                <Zap size={15} />
              </span>
              <div>
                <p className="text-[11px] font-semibold text-ink-800">One schedule, many destinations</p>
                <p className="mt-0.5 text-[9px] text-ink-400">
                  The same approved snapshot feeds .ics, Google Calendar, and future Graph sync.
                </p>
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setSyncOpen(true)}>
              Open sync review
              <ArrowRight size={12} />
            </Button>
          </div>
        </div>
      </div>

      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
    </>
  );
}

function Feature({ ok, title, body }: { ok: boolean; title: string; body: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={classNames(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-teal-50 text-teal-600" : "bg-ink-50 text-ink-300",
        )}
      >
        {ok ? <Check size={9} strokeWidth={3} /> : <LockKeyhole size={8} />}
      </span>
      <div>
        <p className="text-[10px] font-semibold text-ink-800">{title}</p>
        <p className="mt-0.5 text-[9px] leading-4 text-ink-400">{body}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-ink-500">{label}</span>
      <span className="font-mono text-[9px] font-bold text-ink-700">{value}</span>
    </div>
  );
}

function CopyField({ value, label, onCopy }: { value: string; label: string; onCopy: () => void }) {
  return (
    <div className="mt-2">
      <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-ink-400">{label}</p>
      <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-amber-100 bg-white px-2.5 py-1.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[8px] text-ink-500">{value}</code>
        <button type="button" onClick={onCopy} className="shrink-0 text-ink-400 hover:text-ink-700" aria-label="Copy">
          <Clipboard size={11} />
        </button>
      </div>
    </div>
  );
}

function DarkRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-white/55">{label}</span>
      <span className={classNames("flex items-center gap-1 font-mono text-[8px] font-bold", ok ? "text-teal-300" : "text-white/55")}>
        {ok && <Check size={8} />}
        {value}
      </span>
    </div>
  );
}

function SafetyRow({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="font-mono text-[8px] font-bold text-ink-500">{number}</span>
      <div>
        <p className="text-[10px] font-semibold text-ink-800">{title}</p>
        <p className="mt-0.5 text-[9px] leading-4 text-ink-400">{body}</p>
      </div>
    </div>
  );
}

function ConfigRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-ink-100 px-2.5 py-2">
      <span className="text-[9px] text-ink-500">{label}</span>
      <span className={classNames("flex items-center gap-1 text-[9px] font-semibold", ok ? "text-teal-600" : "text-amber-600")}>
        <span className={classNames("h-1.5 w-1.5 rounded-full", ok ? "bg-teal-500" : "bg-amber-500")} />
        {value}
      </span>
    </div>
  );
}
