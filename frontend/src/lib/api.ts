import type {
  AppData,
  Clash,
  Dashboard,
  DigestSendResult,
  EmailDigest,
  GoogleStatus,
  NotificationsPayload,
  RunStats,
  ScheduleEvent,
  Settings,
  Source,
  StudyPlan,
  UnparsedRow,
} from "../types";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      message = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail ?? payload);
    } catch {
      /* keep generic message */
    }
    throw new ApiError(message, response.status);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/calendar") || contentType.includes("text/plain")) {
    return (await response.text()) as T;
  }
  return (await response.json()) as T;
}

export interface IngestResponse {
  source: Source;
  run: { id: string; stats: RunStats | null };
  stats: RunStats;
}

async function download(path: string, fallback: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    let message = "Could not download the file.";
    try {
      const payload = await response.json();
      message = payload.detail || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || fallback;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  dashboard: () => request<Dashboard>("/dashboard"),
  health: () => request<import("../types").Health>("/health"),
  all: async (): Promise<AppData> => {
    const [dashboard, events, clashes, unparsed, sources, runs, settings, google, studyPlan, notifications] =
      await Promise.all([
        request<Dashboard>("/dashboard"),
        request<{ events: ScheduleEvent[] }>("/events"),
        request<{ clashes: Clash[] }>("/clashes"),
        request<{ rows: UnparsedRow[] }>("/unparsed"),
        request<{ sources: Source[] }>("/sources"),
        request<{ runs: import("../types").Run[] }>("/runs?limit=20"),
        request<Settings>("/settings"),
        request<GoogleStatus>("/integrations/google/status"),
        request<StudyPlan>("/study-plan"),
        request<NotificationsPayload>("/notifications"),
      ]);
    return {
      dashboard,
      events: events.events,
      clashes: clashes.clashes,
      unparsed: unparsed.rows,
      sources: sources.sources,
      runs: runs.runs,
      settings,
      google,
      sync: dashboard.sync,
      summary: dashboard.summary,
      studyPlan,
      notifications,
    };
  },
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<IngestResponse>("/sources/upload", { method: "POST", body: form });
  },
  ingestUrl: (url: string) =>
    request<IngestResponse>("/sources/url", { method: "POST", body: JSON.stringify({ url }) }),
  reprocess: (sourceId: string) =>
    request<IngestResponse>(`/sources/${sourceId}/reprocess`, { method: "POST" }),
  deleteSource: (sourceId: string) =>
    request<{ ok: boolean }>(`/sources/${sourceId}`, { method: "DELETE" }),
  approveAll: () =>
    request<{ updated: number; approved: number; total: number; blocked: number }>("/approvals", {
      method: "POST",
      body: JSON.stringify({ approve_all: true }),
    }),
  approveOne: (eventId: string, approved: boolean) =>
    request<ScheduleEvent>(`/events/${eventId}/approval?approved=${approved}`, { method: "POST" }),
  updateEvent: (eventId: string, values: Partial<ScheduleEvent>) =>
    request<ScheduleEvent>(`/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    }),
  resolveClash: (clashId: string, action: "keep_a" | "keep_b" | "keep_both" | "ignore") =>
    request<Clash>(`/clashes/${clashId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
  resolveUnparsed: (rowId: string, values: Record<string, unknown>) =>
    request<ScheduleEvent>(`/unparsed/${rowId}/resolve`, {
      method: "POST",
      body: JSON.stringify(values),
    }),
  deleteUnparsed: (rowId: string) =>
    request<{ ok: boolean }>(`/unparsed/${rowId}`, { method: "DELETE" }),
  saveSettings: (values: Partial<Settings>) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify(values) }),
  googleAuthUrl: () => request<{ url: string }>("/integrations/google/auth-url"),
  googleSync: () =>
    request<{ status: string; created: number; updated: number; skipped: number; synced: number; message: string }>(
      "/integrations/google/sync",
      { method: "POST" },
    ),
  resetDemo: () =>
    request<{ ok: boolean; sourceId: string; dashboard: Dashboard }>("/demo/reset", { method: "POST" }),
  studyPlan: () => request<StudyPlan>("/study-plan"),
  notifications: () => request<NotificationsPayload>("/notifications"),
  digestEmail: () => request<EmailDigest>("/notifications/email"),
  sendDigestEmail: (to?: string) =>
    request<DigestSendResult>("/notifications/email/send", {
      method: "POST",
      body: JSON.stringify({ to: to || null }),
    }),
  downloadIcs: () => download("/sync/ics", "clashfree-schedule.ics"),
  downloadStudyIcs: () => download("/study-plan/ics", "clashfree-study-plan.ics"),
  downloadDigest: () => download("/notifications/email/download", "clashfree-digest.eml"),
  sampleUrl: `${API_BASE}/sample`,
};

export { ApiError };
