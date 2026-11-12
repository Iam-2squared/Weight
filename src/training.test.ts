import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  japanDay, shiftDay, monthGrid, sanitizeSessions, summariesByDay,
  streakStats, personalRanking, formatDuration, loadSessions,
  saveSession, clearSessions, trainingTotals, type TrainingSession,
} from "./training";

const rec = (id: string, endedAt: string, reps = 10): TrainingSession => ({
  id: id.padEnd(8, "_"), endedAt, reps, durationSec: 60,
});

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  });
});
describe("Japan daily records", () => {
  it("uses JST midnight even when the device timezone differs", () => {
    expect(japanDay("2026-11-11T14:59:59.000Z")).toBe("2026-11-11");
    expect(japanDay("2026-11-11T15:00:00.000Z")).toBe("2026-11-12");
  });
  it("handles leap days, month/year changes and Sunday-first calendar cells", () => {
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    const november = monthGrid(2026, 11);
    expect(november[0]).toBe("2026-11-01");
    expect(november[11]).toBe("2026-11-12");
    expect(november.length % 7).toBe(0);
  });
  it("counts only days with at least one saved completed session", () => {
    const sessions = [
      rec("one", "2026-11-09T16:00:00.000Z"),
      rec("two", "2026-11-10T16:00:00.000Z", 15),
      rec("three", "2026-11-10T17:00:00.000Z", 5),
      rec("four", "2026-11-11T15:00:00.000Z", 20),
    ];
    const stats = streakStats(sessions, "2026-11-12");
    expect(stats).toMatchObject({ current: 3, longest: 3, days: 3, totalReps: 50, best: 20 });
    expect(summariesByDay(sessions).get("2026-11-11")).toEqual({reps: 20, sessions: 2});
  });
  it("retains streak through yesterday but resets after a full missed day", () => {
    const sessions = [rec("a", "2026-11-09T16:00:00.000Z"), rec("b", "2026-11-10T16:00:00.000Z")];
    expect(streakStats(sessions, "2026-11-12").current).toBe(2);
    expect(streakStats(sessions, "2026-11-13").current).toBe(0);
  });
  it("does not fabricate streaks from no records", () => {
    expect(streakStats([], "2026-11-12")).toMatchObject({current:0, days:0, best:0, longest:0});
  });
});
describe("on-device record storage", () => {
  it("rejects malformed and zero-rep sessions instead of presenting fabricated rankings", () => {
    expect(sanitizeSessions([{}, null, {id:"a",reps:0,endedAt:"2026-11-12",durationSec:0}])).toEqual([]);
  });
  it("keeps guest and KGS member training data separate", () => {
    const s = rec("abc", "2026-11-11T16:00:00.000Z");
    const member = "123e4567-e89b-12d3-a456-426614174000";
    saveSession(null, s);
    expect(loadSessions(member)).toHaveLength(0);
    saveSession(member, rec("def", "2026-11-12T16:00:00.000Z", 12));
    expect(loadSessions(null)).toHaveLength(1);
    clearSessions(null);
    expect(loadSessions(null)).toHaveLength(0);
    expect(loadSessions(member)).toHaveLength(1);
  });
  it("keeps newest-first records, deduplicates IDs and ranks only real sessions", () => {
    const a = rec("aaa", "2026-11-11T16:00:00.000Z", 12);
    const b = rec("bbb", "2026-11-12T16:00:00.000Z", 20);
    const c = rec("ccc", "2026-11-10T16:00:00.000Z", 20);
    expect(sanitizeSessions([a,b,a,c]).map(s=>s.id)).toEqual([b.id,a.id,c.id]);
    expect(personalRanking([a,b,c]).map(s=>s.id)).toEqual([b.id,c.id,a.id]);
  });
  it("formats minutes and seconds without fake precision", () => {
    expect(formatDuration(66)).toBe("01:06");
    expect(formatDuration(0)).toBe("00:00");
  });
});

describe("best-streak session migration and aggregate metrics", () => {
  it("keeps all old repetitions but never invents an old consecutive count", () => {
    const old = rec("legacy", "2026-11-09T16:00:00.000Z", 27);
    const newRun = {...rec("new", "2026-11-10T16:00:00.000Z", 16), bestStreak: 9};
    const parsed = sanitizeSessions([old,newRun]);
    expect(parsed[1].bestStreak).toBeUndefined();
    expect(trainingTotals(parsed)).toEqual({totalReps:43,bestStreak:9,knownStreakSessions:1});
  });
  it("rejects best streak greater than total or zero for a completed workout", () => {
    const raw = rec("good", "2026-11-11T16:00:00.000Z", 10);
    expect(sanitizeSessions([{...raw,bestStreak:11}])).toEqual([]);
    expect(sanitizeSessions([{...raw,bestStreak:0}])).toEqual([]);
    expect(sanitizeSessions([{...raw,bestStreak:5}])[0].bestStreak).toBe(5);
  });
  it("round-trips bestStreak on device for a signed-in member", () => {
    const userId="123e4567-e89b-12d3-a456-426614174000";
    const session={...rec("sample", "2026-11-12T16:00:00.000Z",20),bestStreak:7};
    saveSession(userId,session);
    expect(loadSessions(userId)[0]).toEqual(session);
  });
});
