import { describe, expect, it } from "vitest";
import { jointAngle, PushupCounter, type CounterSnapshot, type Landmark, type Side } from "./counter";

const joints = { left: [11, 13, 15, 23, 27], right: [12, 14, 16, 24, 28] } as const;
type Point = { x: number; y: number };
type View = { width: number; height: number; mirrored?: boolean };
type PoseOptions = { side?: Side; view?: View; standing?: boolean; bentHip?: boolean; bothSides?: boolean; confidenceFlip?: boolean };
const landscape: View = { width: 1280, height: 720 };

/** A planted hand and ankle, with fixed upper/forearm lengths. The shoulder
 * moves as the arm bends; the hip follows the shoulder-to-ankle body line.
 * This represents a side-on push-up rather than moving a wrist in the air. */
function lateralPose(elbowDegrees: number, options: PoseOptions = {}): Landmark[] {
  const { side = "left", view = landscape } = options;
  const wrist: Point = { x: 200, y: 600 };
  const ankle: Point = { x: 1060, y: 600 };
  const upperArm = 110, forearm = 90;
  const radians = elbowDegrees * Math.PI / 180;
  const distance = Math.sqrt(upperArm ** 2 + forearm ** 2 - 2 * upperArm * forearm * Math.cos(radians));
  const direction = { x: 0.38, y: -Math.sqrt(1 - 0.38 ** 2) };
  const shoulder = { x: wrist.x + direction.x * distance, y: wrist.y + direction.y * distance };
  const projected = (forearm ** 2 + distance ** 2 - upperArm ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, forearm ** 2 - projected ** 2));
  const elbow = {
    x: wrist.x + direction.x * projected - direction.y * height,
    y: wrist.y + direction.y * projected + direction.x * height,
  };
  if (options.standing) { ankle.x = shoulder.x; ankle.y = 100; }
  const hip = { x: (shoulder.x + ankle.x) / 2, y: (shoulder.y + ankle.y) / 2 + (options.bentHip ? 190 : 0) };
  const scale = Math.min(view.width / 1280, view.height / 720);
  const offset = { x: (view.width - 1280 * scale) / 2, y: (view.height - 720 * scale) / 2 };
  const normalize = (point: Point, visibility: number): Landmark => {
    const x = (point.x * scale + offset.x) / view.width;
    return { x: view.mirrored ? 1 - x : x, y: (point.y * scale + offset.y) / view.height, visibility, presence: 1 };
  };
  const points: Landmark[] = Array.from({ length: 33 }, () => ({ x: -1, y: -1, visibility: 0, presence: 0 }));
  const physical = [shoulder, elbow, wrist, hip, ankle];
  for (const current of ["left", "right"] as const) {
    if (current !== side && !options.bothSides) continue;
    const near = current === side;
    const visibility = options.bothSides ? (near !== !!options.confidenceFlip ? 0.98 : 0.7) : 0.98;
    joints[current].forEach((index, i) => { points[index] = normalize(physical[i], visibility); });
  }
  return points;
}

class VideoStream {
  readonly counter = new PushupCounter();
  result: CounterSnapshot = this.counter.snapshot();
  timestamp = 0;
  constructor(readonly options: PoseOptions = {}, readonly frameStep = 100) {}
  frame(angle: number, overrides: PoseOptions = {}) {
    const view = overrides.view ?? this.options.view ?? landscape;
    this.result = this.counter.update(lateralPose(angle, { ...this.options, ...overrides }), this.timestamp, view.width, view.height);
    this.timestamp += this.frameStep;
    return this.result;
  }
  hold(angle: number, count = 6, overrides: PoseOptions = {}) {
    for (let i = 0; i < count; i++) this.frame(angle, overrides);
    return this.result;
  }
  cycle(top = 152, bottom = 121, overrides: PoseOptions = {}) {
    this.hold(top, 6, overrides);
    this.frame(top * 0.7 + bottom * 0.3, overrides);
    this.frame(top * 0.3 + bottom * 0.7, overrides);
    this.hold(bottom, 6, overrides);
    this.frame(top * 0.3 + bottom * 0.7, overrides);
    this.frame(top * 0.7 + bottom * 0.3, overrides);
    return this.hold(top, 6, overrides);
  }
  missing(elapsed = 0) {
    this.timestamp += elapsed;
    const view = this.options.view ?? landscape;
    this.result = this.counter.update(undefined, this.timestamp, view.width, view.height);
    this.timestamp += this.frameStep;
    return this.result;
  }
}

describe("realistic planted-hand side-view movement", () => {
  it("models a moving shoulder and hip while the hand and ankle remain planted", () => {
    const up = lateralPose(152), down = lateralPose(121);
    expect(up[15]).toEqual(down[15]);
    expect(up[27]).toEqual(down[27]);
    expect(down[11].y).toBeGreaterThan(up[11].y);
    expect(down[23].y).toBeGreaterThan(up[23].y);
    expect(jointAngle(down[11], down[13], down[15], 1280, 720)).toBeCloseTo(121);
    expect(jointAngle(down[11], down[23], down[27], 1280, 720)).toBeCloseTo(180);
  });

  it.each(["left", "right"] as const)("counts a 152° upper pose and pictured 121° lower pose using only the %s side", (side) => {
    const stream = new VideoStream({ side });
    expect(stream.cycle()).toMatchObject({ count: 1, side, validForm: true, tracked: true });
  });

  it.each(["left", "right"] as const)("counts a less extended 145°–120° excursion on the %s side", (side) => {
    expect(new VideoStream({ side }).cycle(145, 120)).toMatchObject({ count: 1, side });
  });

  it.each([100, 250, 500, 1000])("counts real down-up movement with %dms between model results", (frameStep) => {
    const stream = new VideoStream({}, frameStep);
    expect(stream.cycle(165, 90).count).toBe(1);
    expect(stream.cycle(152, 121).count).toBe(2);
  });

  const continuousCases = [145, 152].flatMap(top => [12, 10].flatMap(fps => [1.2, 2].map(seconds => ({
    top, bottom: top === 145 ? 120 : 121, fps, seconds,
  }))));
  it.each(continuousCases)("counts continuous $top°–$bottom° motion at $fps FPS and $seconds seconds per rep", ({ top, bottom, fps, seconds }) => {
    const stream = new VideoStream({}, 1000 / fps);
    expect(stream.hold(top).count).toBe(0);
    const frames = Math.round(3 * seconds * fps);
    for (let i = 1; i <= frames; i++) {
      const angle = top - (top - bottom) * (1 - Math.cos(2 * Math.PI * (i / fps) / seconds)) / 2;
      stream.frame(angle);
    }
    // No endpoint pauses between the three repetitions. The last return may
    // still need its stable top samples, but earlier reps must already count.
    expect(stream.result.count).toBeGreaterThanOrEqual(2);
    expect(stream.hold(top).count).toBe(3);
    expect(stream.hold(top, 12).count).toBe(3);
  });

  const views: View[] = [
    { width: 1280, height: 720 }, { width: 1280, height: 720, mirrored: true },
    { width: 640, height: 480 }, { width: 640, height: 480, mirrored: true },
    { width: 390, height: 844 }, { width: 390, height: 844, mirrored: true },
  ];
  it.each(views)("keeps pixel geometry correct at $width×$height (mirrored=$mirrored)", (view) => {
    for (const side of ["left", "right"] as const) {
      expect(new VideoStream({ side, view }).cycle().count).toBe(1);
    }
  });

  it("counts consecutive completed reps once each and never recounts a held top", () => {
    const stream = new VideoStream();
    for (let expected = 1; expected <= 4; expected++) expect(stream.cycle().count).toBe(expected);
    expect(stream.hold(152, 20).count).toBe(4);
  });

  it("does not award a rep for starting at the bottom and merely standing the arms up", () => {
    const stream = new VideoStream();
    expect(stream.hold(121, 12).count).toBe(0);
    expect(stream.hold(152, 12).count).toBe(0);
    expect(stream.cycle().count).toBe(1);
  });

  it("waits for the return to the upper pose before awarding a completed rep", () => {
    const stream = new VideoStream();
    stream.hold(152);
    stream.frame(138);
    expect(stream.hold(121, 16)).toMatchObject({ count: 0, stage: "bottom" });
    expect(stream.hold(152).count).toBe(1);
    expect(stream.hold(152, 15).count).toBe(1);
  });

  it.each([121, 145, 152, 165])("never counts a stationary %d° pose", (angle) => {
    expect(new VideoStream().hold(angle, 60).count).toBe(0);
  });

  it("does not count sensor wobble around a fixed upper pose", () => {
    const stream = new VideoStream();
    stream.hold(152);
    for (let i = 0; i < 12; i++) for (const angle of [149, 153, 150, 152, 148, 151]) stream.frame(angle);
    expect(stream.result.count).toBe(0);
  });

  it("does not count a shallow partial bend followed by return", () => {
    const stream = new VideoStream();
    for (let i = 0; i < 4; i++) stream.cycle(152, 128);
    expect(stream.result.count).toBe(0);
  });

  it("does not count a small 18° excursion even when upper and lower poses are individually recognized", () => {
    const stream = new VideoStream();
    for (let i = 0; i < 4; i++) stream.cycle(142, 124);
    expect(stream.result.count).toBe(0);
  });

  it("rejects the same arm movement while the body is standing upright", () => {
    const stream = new VideoStream({ standing: true });
    expect(stream.cycle(165, 90)).toMatchObject({ count: 0, validForm: false });
  });

  it("rejects a bent body even when the arm makes a complete motion", () => {
    expect(new VideoStream({ bentHip: true }).cycle(165, 90)).toMatchObject({ count: 0, validForm: false });
  });

  it("keeps the selected side throughout far-side confidence fluctuations", () => {
    const stream = new VideoStream({ bothSides: true });
    const angles = [...Array(6).fill(152), 140, 129, ...Array(6).fill(121), 130, 140, ...Array(6).fill(152)];
    angles.forEach((angle, index) => stream.frame(angle, { confidenceFlip: index % 2 === 1 }));
    expect(stream.result).toMatchObject({ count: 1, side: "left" });
  });

  it("does not finish an old half-rep across a genuine loss of the tracking side", () => {
    const stream = new VideoStream({ side: "left" });
    stream.hold(152);
    stream.hold(121, 10);
    expect(stream.result.stage).toBe("bottom");
    expect(stream.hold(152, 8, { side: "right" })).toMatchObject({ count: 0, side: "right" });
    expect(stream.cycle(152, 121, { side: "right" }).count).toBe(1);
  });

  it("does not join top stability samples across a missing camera result", () => {
    const stream = new VideoStream();
    stream.frame(152);
    stream.missing();
    expect(stream.frame(152).stage).toBe("seeking");
    expect(stream.frame(152).stage).toBe("ready");
  });

  it("requires a fresh complete rep after a long gap, even with the same visible side", () => {
    const stream = new VideoStream();
    stream.hold(152);
    stream.hold(121, 10);
    expect(stream.result.stage).toBe("bottom");
    stream.timestamp += 2000;
    expect(stream.hold(152).count).toBe(0);
    expect(stream.cycle().count).toBe(1);
  });

  it("resets both the count and partial movement before another session", () => {
    const stream = new VideoStream();
    stream.cycle();
    stream.hold(121, 10);
    stream.counter.reset();
    expect(stream.hold(152).count).toBe(0);
    expect(stream.cycle().count).toBe(1);
  });
});
