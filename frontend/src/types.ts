export type EventType = "lecture" | "lab" | "exam" | "tutorial" | "seminar";
export type DayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface Evidence {
  sourceId?: string;
  sourceName?: string;
  location?: string;
  row?: number;
  raw?: string;
  engine?: string;
  manual?: boolean;
}

export interface ScheduleEvent {
  id: string;
  source_id: string;
  run_id: string | null;
  identity_key: string;
  title: string;
  course_code: string;
  section: string;
  event_type: EventType;
  days: DayCode[];
  start_time: string;
  end_time: string;
  event_date: string | null;
  room: string;
  instructor: string;
  is_core: boolean;
  confidence: number;
  status: string;
  source_row: number | null;
  raw_text: string;
  evidence: Evidence | null;
  trace_id: string;
  fingerprint: string;
  approved: boolean;
  synced: boolean;
  created_at: string;
  updated_at: string;
  source_name?: string;
  source_location?: string;
}

export interface Clash {
  id: string;
  run_id: string | null;
  source_id: string;
  pair_key: string;
  event_a_id: string;
  event_b_id: string;
  reason: string;
  overlap_minutes: number;
  severity: "high" | "medium";
  status: "open" | "resolved";
  resolution: string | null;
  created_at: string;
  updated_at: string;
  event_a_title: string;
  event_a_code: string;
  event_a_start: string;
  event_a_end: string;
  event_a_days: DayCode[];
  event_a_room: string;
  event_a_core: boolean;
  event_b_title: string;
  event_b_code: string;
  event_b_start: string;
  event_b_end: string;
  event_b_days: DayCode[];
  event_b_room: string;
  event_b_core: boolean;
  source_name?: string;
}

export interface UnparsedRow {
  id: string;
  source_id: string;
  run_id: string | null;
  raw_text: string;
  reason: string;
  confidence: number;
  source_row: number | null;
  page: number | null;
  created_at: string;
  source_name: string;
  source_location: string;
}

export interface RunChange {
  type: "new" | "updated" | "removed";
  title: string;
  fields: string[];
  eventId: string;
}

export interface RunStats {
  new: number;
  updated: number;
  unchanged: number;
  removed: number;
  parsed: number;
  unparsed: number;
  clashes: number;
  engine: string;
  traceId: string;
  sourceName: string;
  sourceKind: string;
  changes: RunChange[];
  runId?: string;
  status?: string;
}

export interface Run {
  id: string;
  source_id: string;
  trace_id: string;
  status: string;
  stage: string;
  engine: string | null;
  started_at: string;
  finished_at: string | null;
  stats: RunStats | null;
  error: string | null;
  source_name: string;
}

export interface Source {
  id: string;
  name: string;
  kind: "demo" | "file" | "url";
  location: string;
  status: string;
  trace_id: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
  event_count: number;
  unparsed_count: number;
  run_count: number;
  last_stats: RunStats | null;
}

export interface Holiday {
  date: string;
  name: string;
}

export interface Settings {
  institution: string;
  termName: string;
  termStart: string;
  termEnd: string;
  readingWeekStart: string;
  readingWeekEnd: string;
  timezone: string;
  holidays: Holiday[];
}

export interface AgentStatus {
  name: string;
  role: string;
  engine: string;
  model: string;
  term: string;
  stages: { id: string; label: string; detail: string }[];
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  account: string | null;
  missing: string[];
  redirectUri: string;
  provider: string;
}

export interface SyncPreview {
  approved: number;
  total: number;
  recurring: number;
  exams: number;
  openClashes: number;
  ready: boolean;
  term: string;
  termStart: string;
  termEnd: string;
  format: string;
}

export interface StudyBlock {
  id: string;
  course_code: string;
  course_title: string;
  event_type: string;
  class_days: DayCode[];
  class_time: string;
  room: string;
  instructor: string;
  is_core: boolean;
  day: DayCode;
  date: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  focus: string;
  anchor: string;
  exam: { date: string; title: string } | null;
  trace_ids: string[];
  approved: boolean;
}

export interface StudyDay {
  day: DayCode;
  label: string;
  blocks: StudyBlock[];
}

export interface StudyPlan {
  generatedAt: string;
  basedOn: { events: number; courses: number; approved: number };
  summary: {
    courses: number;
    blocks: number;
    minutes: number;
    hours: number;
    studyDays: string[];
    excludedDates: number;
    coverage: string;
  };
  blocks: StudyBlock[];
  byDay: StudyDay[];
  methodology: string;
}

export interface NotificationItem {
  id: string;
  kind: "clash" | "unparsed" | "approval" | "study" | "sync";
  tone: "danger" | "warning" | "success" | "info";
  title: string;
  body: string;
  action: { label: string; to: string };
  meta: Record<string, unknown>;
}

export interface CourseDigest {
  course_code: string;
  title: string;
  class_days: DayCode[];
  class_time: string;
  room: string;
  instructor: string;
  study_day: DayCode;
  study_date: string | null;
  study_time: string;
  focus: string;
  anchor: string;
  is_core: boolean;
  exam: { date: string; title: string } | null;
}

export interface EmailDigest {
  subject: string;
  to: string;
  from: string;
  generatedAt: string;
  term: string;
  institution: string;
  text: string;
  html: string;
  courseCount: number;
  blockCount: number;
  notificationCount: number;
}

export interface NotificationsPayload {
  notifications: NotificationItem[];
  unread: number;
  updatedAt: string;
  courses: CourseDigest[];
  studyPlan: StudyPlan;
  email: EmailDigest;
}

export interface DigestSendResult {
  status: "sent" | "queued" | "failed";
  delivery: "smtp" | "outbox";
  to: string;
  subject: string;
  sentAt: string;
  file?: string;
  message: string;
}


export interface Dashboard {
  summary: {
    events: number;
    approved: number;
    synced: number;
    core: number;
    clashes: number;
    unparsed: number;
    sources: number;
    readiness: number;
  };
  settings: Settings;
  lastRun: Run | null;
  eventStatuses: Record<string, number>;
  lastSync: {
    id: string;
    provider: string;
    status: string;
    event_count: number;
    message: string;
    created_at: string;
  } | null;
  recentSources: Source[];
  agent: AgentStatus;
  google: GoogleStatus;
  sync: SyncPreview;
}

export interface Health {
  status: string;
  agent: string;
  version: string;
  capabilities: {
    deterministicParser: boolean;
    multimodalAI: boolean;
    model: string | null;
    googleCalendar: boolean;
    icsExport: boolean;
    studyAgent: boolean;
    emailDigest: boolean;
  };
}

export interface AppData {
  dashboard: Dashboard;
  events: ScheduleEvent[];
  clashes: Clash[];
  unparsed: UnparsedRow[];
  sources: Source[];
  runs: Run[];
  settings: Settings;
  google: GoogleStatus;
  sync: SyncPreview;
  summary: Dashboard["summary"];
  studyPlan: StudyPlan;
  notifications: NotificationsPayload;
}
