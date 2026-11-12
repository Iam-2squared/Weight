import { describe, expect, it } from "vitest";
import { RepStreakTracker, STREAK_GAP_MS } from "./rep-streak";

describe("ten-second consecutive push-up rule", () => {
  it("continues at exactly 10 seconds but restarts at 10 seconds plus 1ms", () => {
    const t = new RepStreakTracker();
    t.recordRep(0);
    t.recordRep(STREAK_GAP_MS);
    expect(t.snapshot()).toEqual({totalReps: 2, currentStreak: 2, bestStreak: 2});
    t.recordRep(STREAK_GAP_MS * 2 + 1);
    expect(t.snapshot()).toEqual({totalReps: 3, currentStreak: 1, bestStreak: 2});
  });
  it("ends the current run after the deadline without losing total or best", () => {
    const t = new RepStreakTracker();
    [0,500,1700].forEach(x=>t.recordRep(x));
    t.advanceTime(11701);
    expect(t.snapshot()).toEqual({totalReps:3,currentStreak:0,bestStreak:3});
    t.recordRep(12000);
    expect(t.snapshot()).toEqual({totalReps:4,currentStreak:1,bestStreak:3});
  });
  it("accounts for paused time and resets on manual counter reset", () => {
    const t = new RepStreakTracker();
    t.recordRep(10_000);
    t.recordRep(11_000);
    t.advanceTime(40_000);
    t.recordRep(41_000);
    expect(t.snapshot()).toEqual({totalReps:3,currentStreak:1,bestStreak:2});
    t.reset();
    expect(t.snapshot()).toEqual({totalReps:0,currentStreak:0,bestStreak:0});
  });
  it("does not count duplicate frame updates as new repetitions", () => {
    const t = new RepStreakTracker();
    t.recordRep(1000);
    t.advanceTime(9000);
    t.advanceTime(9000);
    expect(t.snapshot().totalReps).toBe(1);
  });
  it("refuses invalid timestamps", () => {
    const t = new RepStreakTracker();
    expect(()=>t.recordRep(NaN)).toThrow();
    t.recordRep(50);
    expect(()=>t.recordRep(49)).toThrow();
  });
});
