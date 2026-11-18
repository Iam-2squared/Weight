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
const cycle = () => [top(), top(), top(), mid(), bottom(), bottom(), bottom(), top(), top(), top()];
const leftJoints = [11, 13, 15, 23, 27];
const rightJoints = [12, 14, 16, 24, 28];

function withSides(frame: Landmark[], leftVisibility: number, rightVisibility: number): Landmark[] {
  const points = frame.map((point) => ({ ...point }));
  leftJoints.forEach((left, index) => {
    points[rightJoints[index]] = { ...frame[left], visibility: rightVisibility };
    points[left].visibility = leftVisibility;
  });
  return points;
}

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

  it.each(["left", "right"] as const)("counts with only the %s arm and leg visible", (side) => {
    const frames = cycle().map((frame) => withSides(frame, side === "left" ? 1 : 0, side === "right" ? 1 : 0));
    const result = feed(new PushupCounter(), frames);
    expect(result).toMatchObject({ count: 1, stage: "ready", side, tracked: true, validForm: true });
  });

  it.each(["left", "right"] as const)("ignores the far side outside the frame when following the %s side", (side) => {
    const hidden = side === "left" ? rightJoints : leftJoints;
    const frames = cycle().map((frame) => {
      const points = withSides(frame, side === "left" ? 1 : 0.1, side === "right" ? 1 : 0.1);
      hidden.forEach((index) => { points[index] = { x: -2, y: 3, visibility: 0.1, presence: 0 }; });
      return points;
    });
    expect(feed(new PushupCounter(), frames)).toMatchObject({ count: 1, side, validForm: true });
  });

  it.each(["left", "right"] as const)("keeps tracking the %s side when far-side confidence fluctuates", (side) => {
    const frames = cycle().map((frame, i) => {
      const active = i % 2 === 0 ? 0.98 : 0.7;
      const far = i % 2 === 0 ? 0.7 : 0.98;
      return withSides(frame, side === "left" ? active : far, side === "right" ? active : far);
    });
    expect(feed(new PushupCounter(), frames)).toMatchObject({ count: 1, stage: "ready", side });
  });

  it("does not combine an arm from one side with a leg from the other", () => {
    const frames = cycle().map((frame) => {
      const points = withSides(frame, 1, 1);
      points[15].visibility = 0.1;
      points[28].visibility = 0.1;
      return points;
    });
    expect(feed(new PushupCounter(), frames)).toMatchObject({ count: 0, tracked: false, validForm: false });
  });

  it("restarts an unfinished rep when the tracked side is genuinely lost", () => {
    const counter = new PushupCounter();
    const halfway = feed(counter, [top(), top(), top(), mid(), bottom(), bottom(), bottom()]);
    expect(halfway).toMatchObject({ count: 0, stage: "bottom", side: "left" });
    const switched = feed(counter, [top(), top(), top()].map((frame) => withSides(frame, 0.1, 1)), 700);
    expect(switched).toMatchObject({ count: 0, stage: "ready", side: "right" });
    const completed = feed(counter, [mid(), bottom(), bottom(), bottom(), top(), top(), top()].map((frame) => withSides(frame, 0.1, 1)), 1000);
    expect(completed).toMatchObject({ count: 1, side: "right" });
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

  it("does not finish an old rep after a long gap between video frames", () => {
    const counter = new PushupCounter();
    feed(counter, [top(), top(), mid(), bottom(), bottom(), bottom()]);
    const result = feed(counter, [top(), top()], 3000);
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
