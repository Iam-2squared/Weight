import { describe, expect, it } from "vitest";
import { jointAngle, PushupCounter, type Landmark } from "./counter";

function pose(wrist: { x: number; y: number }, options?: { hipY?: number; visibility?: number }): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const v = options?.visibility ?? 1;
  points[11] = { x: 0.25, y: 0.25, visibility: v }; // left shoulder
  points[13] = { x: 0.35, y: 0.25, visibility: v }; // left elbow
  points[15] = { ...wrist, visibility: v }; // left wrist
  points[23] = { x: 0.55, y: options?.hipY ?? 0.29, visibility: v }; // left hip
  points[27] = { x: 0.86, y: 0.33, visibility: v }; // left ankle
  return points;
}
const top = () => pose({ x: 0.45, y: 0.25 });
const mid = () => pose({ x: 0.39, y: 0.35 });
const bottom = () => pose({ x: 0.35, y: 0.44 });

function feed(counter: PushupCounter, frames: Landmark[][], start = 0) {
  let result = counter.snapshot();
  frames.forEach((frame, i) => {
    result = counter.update(frame, start + i * 100, 1280, 720);
  });
  return result;
}

describe("arm angle", () => {
  it("uses pixels instead of distorted normalized video coordinates", () => {
    expect(jointAngle({ x: 0.25, y: 0.25 }, { x: 0.35, y: 0.25 }, { x: 0.45, y: 0.25 }, 1280, 720)).toBeCloseTo(180);
    expect(jointAngle({ x: 0.25, y: 0.25 }, { x: 0.35, y: 0.25 }, { x: 0.35, y: 0.45 }, 1280, 720)).toBeCloseTo(90);
  });
});

describe("push-up counting", () => {
  it("counts exactly one completed down-up cycle", () => {
    const counter = new PushupCounter();
    const result = feed(counter, [top(), top(), top(), mid(), bottom(), bottom(), bottom(), top(), top(), top()]);
    expect(result.count).toBe(1);
    expect(result.stage).toBe("ready");
  });

  it("does not count shallow motion", () => {
    const counter = new PushupCounter();
    const result = feed(counter, [top(), top(), mid(), mid(), top(), top(), top()]);
    expect(result.count).toBe(0);
  });

  it("does not count if required joints are hidden", () => {
    const counter = new PushupCounter();
    const frames = [top(), top(), bottom(), bottom(), top()].map((frame) =>
      frame.map((p, i) => (i === 27 ? { ...p, visibility: 0.2 } : p)),
    );
    expect(feed(counter, frames).count).toBe(0);
  });

  it("rejects bent-hip positions", () => {
    const counter = new PushupCounter();
    const result = feed(counter, [top(), top(), bottom(), bottom(), top(), top()].map((frame) => {
      const copy = frame.map((p) => ({ ...p }));
      copy[23].y = 0.62;
      return copy;
    }));
    expect(result.count).toBe(0);
    expect(result.validForm).toBe(false);
  });

  it("resets an incomplete repetition after tracking is lost", () => {
    const counter = new PushupCounter();
    feed(counter, [top(), top(), mid(), bottom(), bottom()]);
    counter.update(null, 2000, 1280, 720);
    const result = feed(counter, [top(), top(), top()], 2100);
    expect(result.count).toBe(0);
  });

  it("can reset counts manually", () => {
    const counter = new PushupCounter();
    feed(counter, [top(), top(), mid(), bottom(), bottom(), bottom(), top(), top(), top()]);
    counter.reset();
    expect(counter.snapshot().count).toBe(0);
    expect(counter.snapshot().stage).toBe("seeking");
  });
});
