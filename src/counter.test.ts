import { describe, expect, it } from "vitest";
import { isVisibleLandmark, jointAngle, PushupCounter } from "./counter";
import { FrontStream, frontPose } from "./counter-fixture";

describe("front-view upper-body counter", () => {
  it("counts one complete down-up cycle with only shoulders, elbows and wrists", () => {
    const stream = new FrontStream();
    expect(frontPose(0)).toHaveLength(17);
    expect(stream.cycle()).toMatchObject({ count: 1, stage: "ready", tracked: true, validForm: true, bodyAngle: null });
  });
  it("counts repeated completed cycles once each and does not recount a held top", () => {
    const stream = new FrontStream();
    for (let count = 1; count <= 4; count++) expect(stream.cycle().count).toBe(count);
    expect(stream.hold(0, 30).count).toBe(4);
  });
  it("does not award the initial half-rep when starting at the bottom", () => {
    const stream = new FrontStream();
    stream.hold(1, 12);
    expect(stream.hold(0, 12).count).toBe(0);
    expect(stream.cycle().count).toBe(1);
  });
  it("waits for the upward return, rather than awarding descent", () => {
    const stream = new FrontStream();
    stream.hold(0);
    expect(stream.hold(1, 15)).toMatchObject({ count: 0, stage: "bottom" });
    expect(stream.hold(0).count).toBe(1);
  });
  it.each([0, 0.5, 1])("does not count a stationary depth %s", depth => {
    expect(new FrontStream().hold(depth, 60).count).toBe(0);
  });
  it("does not count slight sensor wobble or shallow dips", () => {
    const stream = new FrontStream();
    for (let cycle = 0; cycle < 8; cycle++) stream.cycle({}, 0.15);
    expect(stream.reading.count).toBe(0);
  });
  it("does not count one arm moving while the opposite shoulder stays still", () => {
    expect(new FrontStream({ unilateral: true }).cycle().count).toBe(0);
  });
  it("does not count moving hands/arm curls with stationary shoulders", () => {
    expect(new FrontStream({ curl: true }).cycle().count).toBe(0);
  });
  it("does not keep an unstable first-acquisition hand position as a permanent anchor", () => {
    const stream = new FrontStream();
    const first = frontPose(0); first[15].x += 0.3;
    stream.counter.update(first, stream.timestamp, 1280, 720);
    stream.timestamp += 100;
    expect(stream.cycle().count).toBe(1);
  });
  it("does not award a single rising model spike above a confirmed bottom", () => {
    const stream = new FrontStream();
    stream.hold(0); stream.hold(1, 8);
    expect(stream.frame(0).count).toBe(0);
    expect(stream.hold(1, 4).count).toBe(0);
  });
  it.each([11, 12, 13, 14, 15, 16])("does not count when required front joint %d is absent", index => {
    const counter = new PushupCounter();
    for (let i = 0; i < 30; i++) {
      const points = frontPose(i % 12 < 6 ? 0 : 1);
      points[index].visibility = 0;
      expect(counter.update(points, i * 100, 1280, 720).count).toBe(0);
    }
  });
  it("resets an incomplete cycle after an outage", () => {
    const stream = new FrontStream();
    stream.hold(0); stream.hold(1, 10); stream.missing(2000);
    expect(stream.hold(0).count).toBe(0);
    expect(stream.cycle().count).toBe(1);
  });
  it("resetTracking drops a half-rep and preserves credited reps", () => {
    const stream = new FrontStream();
    stream.cycle(); stream.hold(1, 10); stream.counter.resetTracking();
    expect(stream.hold(0).count).toBe(1);
    expect(stream.cycle().count).toBe(2);
  });
  it("reset clears the count and starts another session without inherited movement", () => {
    const stream = new FrontStream();
    stream.cycle(); stream.hold(1, 10); stream.counter.reset();
    expect(stream.hold(0).count).toBe(0);
    expect(stream.cycle().count).toBe(1);
  });
  it("requires valid, finite visible coordinates", () => {
    expect(isVisibleLandmark(undefined)).toBe(false);
    expect(isVisibleLandmark({ x: NaN, y: 0, visibility: 1 })).toBe(false);
    expect(isVisibleLandmark({ x: 0, y: 0, presence: 0.1 })).toBe(false);
    expect(isVisibleLandmark({ x: 0, y: 0, visibility: 0.9, presence: 0.9 })).toBe(true);
  });
  it("measures angles in actual pixel geometry", () => {
    expect(jointAngle({ x: 0.25, y: 0.25 }, { x: 0.35, y: 0.25 }, { x: 0.45, y: 0.25 }, 1280, 720)).toBeCloseTo(180);
    expect(jointAngle({ x: 0.25, y: 0.25 }, { x: 0.35, y: 0.25 }, { x: 0.35, y: 0.45 }, 1280, 720)).toBeCloseTo(90);
  });
});
