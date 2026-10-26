import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  CircleAlert,
  Info,
  Mail,
  Send,
  TriangleAlert,
} from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../context/AppContext";
import { classNames } from "../lib/utils";
import { Badge, Button, Modal } from "./ui";

const toneStyles = {
  danger: { icon: CircleAlert, wrap: "bg-coral-50 text-coral-600", badge: "danger" as const },
  warning: { icon: TriangleAlert, wrap: "bg-amber-50 text-amber-600", badge: "warning" as const },
  success: { icon: CheckCircle2, wrap: "bg-teal-50 text-teal-600", badge: "success" as const },
  info: { icon: Info, wrap: "bg-[#EFF4FC] text-[#3D6196]", badge: "info" as const },
};

export function NotificationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, refresh, toast } = useApp();
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!data) return null;
  const payload = data.notifications;
  const email = payload.email;

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

  const downloadDigest = async () => {
    setDownloading(true);
    try {
      await api.downloadDigest();
      toast("Digest downloaded as .eml.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download the digest.", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Agent notifications"
      description="Clashes, quarantined rows, approval work, and the study digest built from your timetable."
    >
      <div className="space-y-5">
        <section aria-labelledby="notifications-heading">
          <div className="mb-2 flex items-center justify-between">
            <h3 id="notifications-heading" className="eyebrow">
              Inbox · {payload.unread} need action
            </h3>
            <Badge tone="neutral">{payload.notifications.length} items</Badge>
          </div>
          {payload.notifications.length === 0 ? (
            <p className="rounded-2xl border border-ink-100 bg-ink-50/60 p-4 text-[12px] text-ink-500">
              Nothing needs attention. The agent will raise a notification when a row is quarantined or a clash appears.
            </p>
          ) : (
            <ul className="space-y-2">
              {payload.notifications.map((item) => {
                const style = toneStyles[item.tone];
                const Icon = style.icon;
                return (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-ink-100 bg-white p-3.5 shadow-[0_1px_0_rgba(13,20,17,.02)]"
                  >
                    <div className="flex items-start gap-3">
                      <span className={classNames("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", style.wrap)}>
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[12px] font-bold text-ink-900">{item.title}</p>
                          <Badge tone={style.badge}>{item.kind}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-ink-500">{item.body}</p>
                        <Link
                          to={item.action.to}
                          onClick={onClose}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-500"
                        >
                          {item.action.label}
                          <span aria-hidden="true">→</span>
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="email-heading" className="rounded-2xl border border-ink-100 bg-ink-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="email-heading" className="flex items-center gap-2 font-display text-[14px] font-bold text-ink-950">
                <Mail size={15} className="text-teal-600" />
                Email digest
              </h3>
              <p className="mt-1 text-[11px] leading-5 text-ink-500">
                To {email.to} · {email.courseCount} subjects · {email.blockCount} study blocks
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void downloadDigest()} loading={downloading}>
                Download .eml
              </Button>
              <Button size="sm" icon={<Send size={13} />} onClick={() => void sendDigest()} loading={sending}>
                Send digest
              </Button>
            </div>
          </div>
          <p className="mt-3 rounded-xl bg-white px-3 py-2 text-[12px] font-semibold text-ink-800">{email.subject}</p>
          <pre
            className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white px-3 py-3 font-sans text-[11px] leading-5 text-ink-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500"
            tabIndex={0}
            aria-label="Email digest preview"
          >
            {email.text}
          </pre>
          <p className="mt-2 text-[10px] text-ink-400">
            SMTP is optional. Without it, the digest is written to the local outbox and downloadable as .eml.
          </p>
        </section>
      </div>
    </Modal>
  );
}
