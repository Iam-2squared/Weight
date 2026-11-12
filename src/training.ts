export interface TrainingSession {
  id: string;
  reps: number;
  endedAt: string;
  durationSec: number;
}

const STORAGE_VERSION = "weight.training.v1";
const MAX_SESSIONS = 2000;
const MAX_REPS = 5000;
const DAY_MS = 86_400_000;

function storageKey(accountId: string | null): string {
  const key = accountId && /^[a-f0-9-]{36}$/i.test(accountId) ? accountId : "guest";
  return STORAGE_VERSION + ":" + key;
}

export function japanDay(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const p = (kind: string) => parts.find((entry) => entry.type === kind)?.value ?? "";
  return p("year") + "-" + p("month") + "-" + p("day");
}

export function shiftDay(day: string, offset: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid day");
  return new Date(Date.parse(day + "T00:00:00Z") + offset * DAY_MS).toISOString().slice(0, 10);
}

export function monthGrid(year: number, month: number): (string | null)[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid month");
  }
  const offset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= count; day++) {
    cells.push(String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0"));
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function validateSession(value: unknown): TrainingSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(row.id)) return null;
  if (!Number.isInteger(row.reps) || (row.reps as number) < 1 || (row.reps as number) > MAX_REPS) return null;
  if (typeof row.endedAt !== "string" || row.endedAt.length > 40) return null;
  const date = new Date(row.endedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== row.endedAt) return null;
  if (!Number.isInteger(row.durationSec) || (row.durationSec as number) < 0 || (row.durationSec as number) > 86_400) return null;
  return { id: row.id, reps: row.reps as number, endedAt: row.endedAt, durationSec: row.durationSec as number };
}

export function sanitizeSessions(value: unknown): TrainingSession[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: TrainingSession[] = [];
  for (const entry of value.slice(0, MAX_SESSIONS + 100)) {
    const session = validateSession(entry);
    if (!session || seen.has(session.id)) continue;
    seen.add(session.id);
    result.push(session);
    if (result.length === MAX_SESSIONS) break;
  }
  return result.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

export function loadSessions(accountId: string | null): TrainingSession[] {
  try {
    const raw = window.localStorage.getItem(storageKey(accountId));
    return raw ? sanitizeSessions(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveSession(accountId: string | null, session: TrainingSession): TrainingSession[] {
  const valid = validateSession(session);
  if (!valid) throw new Error("Invalid session");
  const next = sanitizeSessions([valid, ...loadSessions(accountId)]);
  window.localStorage.setItem(storageKey(accountId), JSON.stringify(next));
  return next;
}

export function clearSessions(accountId: string | null): void {
  window.localStorage.removeItem(storageKey(accountId));
}

export interface DaySummary { reps: number; sessions: number; }
export function summariesByDay(sessions: TrainingSession[]): Map<string, DaySummary> {
  const result = new Map<string, DaySummary>();
  for (const session of sessions) {
    const day = japanDay(session.endedAt);
    const previous = result.get(day) ?? { reps: 0, sessions: 0 };
    result.set(day, { reps: previous.reps + session.reps, sessions: previous.sessions + 1 });
  }
  return result;
}

export function streakStats(sessions: TrainingSession[], today: string) {
  const days = new Set(summariesByDay(sessions).keys());
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  let current = 0;
  let day = days.has(today) ? today : shiftDay(today, -1);
  while (days.has(day)) {
    current++;
    day = shiftDay(day, -1);
  }
  return {
    current,
    longest,
    days: days.size,
    totalReps: sessions.reduce((sum, session) => sum + session.reps, 0),
    best: sessions.length ? Math.max(...sessions.map((session) => session.reps)) : 0,
  };
}

export function personalRanking(sessions: TrainingSession[], limit = 10): TrainingSession[] {
  return [...sessions].sort((a, b) => b.reps - a.reps || b.endedAt.localeCompare(a.endedAt)).slice(0, limit);
}

export function formatDuration(seconds: number): string {
  return Math.floor(seconds / 60).toString().padStart(2, "0") + ":" + (seconds % 60).toString().padStart(2, "0");
}
