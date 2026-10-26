import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarCheck2,
  ChevronRight,
  Database,
  LayoutDashboard,
  ListChecks,
  Menu,
  Plug,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { classNames, formatDateRange, relativeTime } from "../lib/utils";
import { Badge, Button, SkeletonPage } from "./ui";
import { NotificationsModal } from "./NotificationsModal";

const navigation = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/review", label: "Review queue", icon: ListChecks },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/study-plan", label: "Study plan", icon: CalendarClock },
  { to: "/sources", label: "Sources", icon: Database },
  { to: "/integrations", label: "Integrations", icon: Plug },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="ClashFree home">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-lime-400 text-ink-950 shadow-[inset_0_-2px_0_rgba(13,20,17,.16)]">
        <CalendarCheck2 size={19} strokeWidth={2.4} />
        <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full bg-ink-950/10" />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[17px] font-extrabold tracking-[-0.045em] text-ink-950">
            ClashFree
          </span>
          <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-400">
            Schedule intelligence
          </span>
        </span>
      )}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { data, refresh, refreshing } = useApp();
  const location = useLocation();
  const reviewCount = (data?.clashes.length || 0) + (data?.unparsed.length || 0);
  const lastRun = data?.dashboard.lastRun;
  const term = data?.settings;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[74px] items-center justify-between px-5">
        <Logo />
        <Badge tone="lime" className="hidden lg:inline-flex">
          v1.0
        </Badge>
      </div>

      <div className="px-3">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.045] p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">Active term</p>
            <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
          </div>
          <p className="mt-2 truncate font-display text-[13px] font-semibold text-white">
            {term?.termName || "Academic term"}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-white/55">{term?.institution}</p>
          {term && (
            <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1.5 text-[9px] font-medium text-white/55">
              <CalendarDays size={11} className="text-lime-400/80" />
              {formatDateRange(term.termStart, term.termEnd)}
            </div>
          )}
        </div>
      </div>

      <nav className="mt-5 flex-1 overflow-y-auto px-3" aria-label="Primary navigation">
        <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">Workspace</p>
        <ul className="space-y-0.5">
          {navigation.map((item) => {
            const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
            const showBadge = item.to === "/review" && reviewCount > 0;
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={classNames(
                    "group flex h-10 items-center gap-3 rounded-xl px-3 text-[12.5px] font-medium transition",
                    active
                      ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)]"
                      : "text-white/55 hover:bg-white/[0.05] hover:text-white",
                  )}
                >
                  <item.icon
                    size={16}
                    strokeWidth={active ? 2.3 : 1.9}
                    className={active ? "text-lime-400" : "text-white/55 group-hover:text-white/70"}
                  />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span
                      className={classNames(
                        "rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold",
                        active ? "bg-lime-400 text-ink-950" : "bg-coral-500/15 text-coral-400",
                      )}
                    >
                      {reviewCount}
                    </span>
                  )}
                  {active && !showBadge && <span className="h-1 w-1 rounded-full bg-lime-400" />}
                </NavLink>
              </li>
            );
          })}
        </ul>

        <div className="my-5 h-px bg-white/[0.07]" />
        <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/55">Agent</p>
        <div className="rounded-2xl border border-lime-400/15 bg-lime-400/[0.055] p-3.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-6 w-6 items-center justify-center rounded-lg bg-lime-400 text-ink-950">
              <Sparkles size={13} />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-ink-950 bg-lime-300" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-white">Agent online</p>
              <p className="truncate text-[9px] text-white/55">{data?.dashboard.agent.engine}</p>
            </div>
          </div>
          <p className="mt-2.5 text-[10px] leading-4 text-white/60">
            {lastRun
              ? `Last run ${relativeTime(lastRun.started_at)} · ${lastRun.stats?.parsed ?? 0} rows read`
              : "Ready for your first timetable."}
          </p>
          <button
            type="button"
            onClick={() => void refresh(true)}
            className="mt-2.5 flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/[0.08] hover:text-white"
          >
            Refresh agent state
            <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        <Link
          to="/settings"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-xl p-2 transition hover:bg-white/[0.05]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-ink-700 text-[10px] font-bold text-white ring-2 ring-white/10">
            HB
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-white">Hii buddy</p>
            <p className="truncate text-[9px] text-white/55">Student workspace</p>
          </div>
          <ChevronRight size={13} className="text-white/25" />
        </Link>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh, refreshing } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (loading) return <SkeletonPage />;

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="surface w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-coral-50 text-coral-500">
            <ShieldCheck size={26} />
          </div>
          <h1 className="mt-5 font-display text-xl font-bold text-ink-950">The agent is offline</h1>
          <p className="mt-2 text-[13px] leading-6 text-ink-500">
            ClashFree could not reach its FastAPI backend. Start it with{" "}
            <code className="rounded bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
              python -m uvicorn app.main:app --reload
            </code>{" "}
            from the <code className="font-mono text-[11px]">backend</code> folder.
          </p>
          <p className="mt-3 rounded-xl bg-coral-50 px-3 py-2 text-left font-mono text-[10px] leading-4 text-coral-600">
            {error}
          </p>
          <Button className="mt-5 w-full" onClick={() => void refresh()} loading={refreshing}>
            Retry connection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] overflow-hidden bg-ink-950 lg:block">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_20%_0%,rgba(199,240,106,.14),transparent_60%)]" />
        <div className="relative h-full">
          <SidebarContent />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[280px] animate-slide-in bg-ink-950">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 z-10 rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-30 border-b border-ink-100/70 bg-paper/85 backdrop-blur-xl">
          <div className="mx-auto flex h-[60px] max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border border-ink-200 bg-white p-2 text-ink-700 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>
              <div className="hidden items-center gap-2.5 sm:flex">
                <span className="flex h-6 items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-2.5 text-[9px] font-bold uppercase tracking-[0.1em] text-teal-600">
                  <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-teal-500" />
                  Agent online
                </span>
                <span className="text-[11px] text-ink-400">
                  {data.settings.termName} · {data.settings.institution}
                </span>
              </div>
              <div className="sm:hidden">
                <Logo compact />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotificationsOpen(true)}
                className="relative rounded-xl p-2 text-ink-500 transition hover:bg-white hover:text-ink-900"
                aria-label={`Open notifications${data.notifications.unread ? `, ${data.notifications.unread} need action` : ""}`}
              >
                <Bell size={17} />
                {data.notifications.unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-coral-500 px-0.5 text-[8px] font-bold text-white ring-2 ring-paper">
                    {data.notifications.unread}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => void refresh(true)}
                className="rounded-xl p-2 text-ink-500 transition hover:bg-white hover:text-ink-900"
                aria-label="Refresh data"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              </button>
              <div className="mx-1 hidden h-6 w-px bg-ink-200 sm:block" />
              <Link
                to="/review"
                className="hidden items-center gap-1.5 rounded-xl bg-ink-900 px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-ink-800 sm:flex"
              >
                Review & sync
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 pb-8 pt-4 text-[10px] text-ink-400 sm:px-6 lg:px-8">
          <p>ClashFree keeps a trace ID on every imported event.</p>
          <p className="hidden items-center gap-1.5 sm:flex">
            <ShieldCheck size={12} />
            Human approval required before sync
          </p>
        </footer>
      </div>

      <NotificationsModal open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
}
