import { useState } from "react";
import { ArrowLeftRight, CalendarX2, Check, Clock3, MapPin, ShieldAlert } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import type { Clash } from "../types";
import { Badge, Button, Modal } from "./ui";
import { timeRange } from "../lib/utils";

type Action = "keep_a" | "keep_b" | "keep_both" | "ignore";

export function ClashModal({ clash, onClose }: { clash: Clash | null; onClose: () => void }) {
  const { refresh, toast } = useApp();
  const [busy, setBusy] = useState<Action | null>(null);

  if (!clash) return null;

  const resolve = async (action: Action) => {
    setBusy(action);
    try {
      await api.resolveClash(clash.id, action);
      await refresh(true);
      toast("Clash marked as resolved. ClashFree kept an audit record.");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not resolve clash.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Resolve schedule clash"
      description="Choose which commitment takes priority. ClashFree will not silently drop either event."
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] text-ink-400">Resolution is logged with the clash ID.</p>
          <Button variant="ghost" size="sm" onClick={() => void resolve("ignore")} loading={busy === "ignore"}>
            Ignore this clash
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-coral-100 bg-coral-50 p-4">
          <ShieldAlert size={20} className="mt-0.5 shrink-0 text-coral-500" />
          <div>
            <p className="text-[12px] font-bold text-coral-600">
              Direct overlap · {clash.overlap_minutes} minutes
            </p>
            <p className="mt-1 text-[11px] leading-5 text-ink-600">{clash.reason}</p>
          </div>
        </div>

        <div className="relative grid gap-3 sm:grid-cols-2">
          <ClashOption
            label="Option A"
            code={clash.event_a_code}
            title={clash.event_a_title}
            time={timeRange(clash.event_a_start, clash.event_a_end)}
            days={clash.event_a_days.join(", ")}
            room={clash.event_a_room}
            core={clash.event_a_core}
            tone="lime"
            onSelect={() => void resolve("keep_a")}
            loading={busy === "keep_a"}
          />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-400 shadow-soft sm:flex">
            <ArrowLeftRight size={13} />
          </div>
          <ClashOption
            label="Option B"
            code={clash.event_b_code}
            title={clash.event_b_title}
            time={timeRange(clash.event_b_start, clash.event_b_end)}
            days={clash.event_b_days.join(", ")}
            room={clash.event_b_room}
            core={clash.event_b_core}
            tone="teal"
            onSelect={() => void resolve("keep_b")}
            loading={busy === "keep_b"}
          />
        </div>

        <div className="rounded-2xl border border-ink-100 p-4">
          <p className="text-[11px] font-bold text-ink-800">A separate arrangement is possible</p>
          <p className="mt-1 text-[10px] leading-5 text-ink-500">
            If your institution allows an alternate section or makeup session, keep both commitments and note that
            you’ll arrange a manual resolution with your advisor.
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            icon={<Check size={13} />}
            loading={busy === "keep_both"}
            onClick={() => void resolve("keep_both")}
          >
            Keep both & acknowledge
          </Button>
        </div>

        <div className="flex items-center gap-4 text-[9px] text-ink-400">
          <span className="inline-flex items-center gap-1">
            <Clock3 size={10} />
            Weekly recurrence checked
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarX2 size={10} />
            Exam dates checked
          </span>
        </div>
      </div>
    </Modal>
  );
}

function ClashOption({
  label,
  code,
  title,
  time,
  days,
  room,
  core,
  tone,
  onSelect,
  loading,
}: {
  label: string;
  code: string;
  title: string;
  time: string;
  days: string;
  room: string;
  core: boolean;
  tone: "lime" | "teal";
  onSelect: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</span>
        <Badge tone={core ? "lime" : "neutral"}>{core ? "Core" : "Elective"}</Badge>
      </div>
      <p className="mt-3 font-mono text-[10px] font-bold text-ink-400">{code || "NO CODE"}</p>
      <h3 className="mt-0.5 font-display text-[14px] font-bold leading-5 text-ink-950">{title}</h3>
      <div className="mt-3 space-y-1.5">
        <p className="flex items-center gap-1.5 text-[10px] text-ink-600">
          <Clock3 size={11} className="text-ink-400" />
          {days} · {time}
        </p>
        <p className="flex items-center gap-1.5 text-[10px] text-ink-600">
          <MapPin size={11} className="text-ink-400" />
          {room || "Room TBC"}
        </p>
      </div>
      <Button
        className={`mt-4 w-full ${tone === "lime" ? "" : ""}`}
        variant="secondary"
        size="sm"
        loading={loading}
        onClick={onSelect}
      >
        Keep this commitment
      </Button>
    </div>
  );
}
