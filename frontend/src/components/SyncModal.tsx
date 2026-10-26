import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  Check,
  CheckCircle2,
  CloudDownload,
  Download,
  GitCompareArrows,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { formatDateRange } from "../lib/utils";
import { Badge, Button, Modal } from "./ui";
import { Link } from "react-router-dom";

type SyncMethod = "ics" | "google";

export function SyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, refresh, toast } = useApp();
  const [method, setMethod] = useState<SyncMethod>("ics");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const approved = data?.sync.approved ?? 0;
  const total = data?.sync.total ?? 0;
  const clashes = data?.sync.openClashes ?? 0;
  const unparsed = data?.unparsed.length ?? 0;
  const googleReady = Boolean(data?.google.connected);
  const alreadyApproved = approved > 0;

  useEffect(() => {
    if (!open) {
      setConfirmed(false);
      setBusy(false);
      setMethod("ics");
    }
  }, [open]);

  const blockers = useMemo(() => {
    const items: string[] = [];
    if (clashes > 0) items.push(`${clashes} unresolved clash${clashes === 1 ? "" : "es"}`);
    if (unparsed > 0) items.push(`${unparsed} unparsed row${unparsed === 1 ? "" : "s"}`);
    return items;
  }, [clashes, unparsed]);

  const runSync = async () => {
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.approveAll();
      if (method === "ics") {
        await api.downloadIcs();
        toast("Calendar exported. Recurring classes and trace IDs are included.");
      } else {
        const result = await api.googleSync();
        toast(result.message);
      }
      await refresh(true);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Sync failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Approve & sync"
      description="Nothing is written to a calendar until you approve it."
      wide
      footer={
        <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <p className="flex items-center gap-1.5 text-[10px] text-ink-400">
            <LockKeyhole size={11} />
            Human approval gate is always enforced.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="md"
              onClick={() => void runSync()}
              disabled={!confirmed || clashes > 0}
              loading={busy}
              icon={method === "ics" ? <Download size={14} /> : <CalendarPlus size={14} />}
            >
              {clashes > 0
                ? "Resolve clashes first"
                : alreadyApproved
                  ? "Sync approved events"
                  : `Approve ${total} & sync`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink-100 bg-ink-50/60 p-3.5">
            <p className="eyebrow">Verified events</p>
            <p className="mt-1.5 font-display text-2xl font-extrabold tracking-[-0.05em] text-ink-950">
              {total}
            </p>
            <p className="text-[10px] text-ink-500">{approved} approved so far</p>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-3.5">
            <p className="eyebrow">Recurring</p>
            <p className="mt-1.5 font-display text-2xl font-extrabold tracking-[-0.05em] text-ink-950">
              {data?.events.filter((event) => !event.event_date).length ?? 0}
            </p>
            <p className="text-[10px] text-ink-500">weekly class streams</p>
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-3.5">
            <p className="eyebrow">Term</p>
            <p className="mt-2 font-display text-[12px] font-bold leading-4 text-ink-950">
              {data?.settings.termName}
            </p>
            <p className="mt-0.5 text-[10px] text-ink-500">
              {data && formatDateRange(data.settings.termStart, data.settings.termEnd)}
            </p>
          </div>
        </div>

        <div>
          <p className="label">Destination</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMethod("ics")}
              className={`relative rounded-2xl border p-4 text-left transition ${
                method === "ics"
                  ? "border-ink-900 bg-ink-900 text-white shadow-lift"
                  : "border-ink-200 bg-white hover:border-ink-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    method === "ics" ? "bg-lime-400 text-ink-950" : "bg-ink-50 text-ink-600"
                  }`}
                >
                  <CloudDownload size={17} />
                </span>
                {method === "ics" && <CheckCircle2 size={16} className="text-lime-400" />}
              </div>
              <p className="mt-3 text-[13px] font-bold">Calendar file (.ics)</p>
              <p className={`mt-1 text-[10px] leading-4 ${method === "ics" ? "text-white/55" : "text-ink-500"}`}>
                Download and import into Google, Outlook, or Apple Calendar. No account access needed.
              </p>
            </button>
            <div
              className={`relative rounded-2xl border p-4 text-left transition ${
                method === "google"
                  ? "border-ink-900 bg-ink-900 text-white shadow-lift"
                  : "border-ink-200 bg-white hover:border-ink-300"
              }`}
            >
              {googleReady && (
                <button
                  type="button"
                  onClick={() => setMethod("google")}
                  aria-label="Use Google Calendar"
                  className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                />
              )}
              <div className="pointer-events-none relative z-10">
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      method === "google" ? "bg-lime-400 text-ink-950" : "bg-ink-50 text-ink-600"
                    }`}
                  >
                    <CalendarCheck size={17} />
                  </span>
                  {method === "google" ? (
                    <CheckCircle2 size={16} className="text-lime-400" />
                  ) : !googleReady ? (
                    <Unplug size={14} className="text-ink-400" />
                  ) : null}
                </div>
                <p className="mt-3 text-[13px] font-bold">Google Calendar</p>
                <p className={`mt-1 text-[10px] leading-4 ${method === "google" ? "text-white/55" : "text-ink-500"}`}>
                  {googleReady
                    ? "Push approved events directly with idempotent updates."
                    : "Not connected. Configure OAuth in Integrations."}
                </p>
              </div>
              {!googleReady && (
                <Link
                  to="/integrations"
                  className="relative z-10 mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-600"
                  onClick={onClose}
                >
                  Connect Google
                  <ArrowRight size={10} />
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-ink-50/50 p-4">
          <div className="flex items-center gap-2">
            <GitCompareArrows size={15} className="text-ink-500" />
            <p className="text-[12px] font-bold text-ink-800">Idempotent sync</p>
            <Badge tone="success" className="ml-auto">
              Safe re-run
            </Badge>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-ink-500">
            Every event has a stable fingerprint. Re-importing a revised timetable updates changed cells and leaves
            untouched events alone.
          </p>
        </div>

        {blockers.length > 0 && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="text-[12px] font-bold text-amber-600">Open items need your eyes</p>
                <p className="mt-1 text-[11px] leading-5 text-ink-600">
                  {blockers.join(" and ")} must be mediated before the calendar write. Clash-linked events are
                  excluded from approval until you choose a resolution.
                </p>
                <Link
                  to="/review"
                  onClick={onClose}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 underline decoration-amber-300 underline-offset-2"
                >
                  Open review queue
                  <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-100 p-3.5 transition hover:bg-ink-50/50">
          <span
            className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${
              confirmed ? "border-ink-900 bg-ink-900 text-lime-400" : "border-ink-300 bg-white"
            }`}
          >
            {confirmed && <Check size={11} strokeWidth={3} />}
          </span>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="sr-only"
          />
          <span className="text-[11px] leading-5 text-ink-600">
            I reviewed the staged schedule and approve writing{" "}
            <strong className="text-ink-900">{total} verified items</strong> to my calendar. I understand this may
            modify an existing calendar and that unresolved items are excluded.
          </span>
        </label>

        <div className="flex items-center justify-between gap-3 text-[10px] text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-teal-500" />
            Trace IDs embedded in every exported event
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={11} className="text-lime-500" />
            No silent drops
          </span>
        </div>
      </div>
    </Modal>
  );
}
