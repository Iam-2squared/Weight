import { describe, expect, it } from "vitest";
import { FrontStream, frontPose } from "./counter-fixture";

describe("front-view framing and continuous movement", () => {
  it.each([
    { width: 1280, height: 720 }, { width: 640, height: 480 }, { width: 390, height: 844 },
    { width: 1280, height: 720, mirrored: true }, { width: 390, height: 844, mirrored: true },
    { width: 1280, height: 720, rotation: 0.15 }, { width: 1280, height: 720, rotation: -0.15 },
  ])("counts with framing $width×$height and mirror=$mirrored rotation=$rotation", settings => {
    expect(new FrontStream(settings).cycle().count).toBe(1);
  });
  it.each([100, 250, 500, 1000])("counts at %dms per model update", step => {
    const stream = new FrontStream({}, step);
    expect(stream.cycle().count).toBe(1);
    expect(stream.cycle().count).toBe(2);
  });
  it.each([80, 100])("counts continuous 2-second movements with %dms model updates", step => {
    const stream = new FrontStream({}, step);
    stream.hold(0);
    for (let t = 0; t <= 6000; t += step) stream.frame((1 - Math.cos(2 * Math.PI * t / 2000)) / 2);
    expect(stream.hold(0).count).toBe(3);
  });
  it("ignores hidden hips, knees and feet even if supplied with invalid coordinates", () => {
    const stream = new FrontStream();
    for (const depth of [...Array(6).fill(0), ...Array(8).fill(1), ...Array(8).fill(0)]) {
      const pose = frontPose(depth);
      for (let i = 17; i < 33; i++) pose[i] = { x: NaN, y: NaN, visibility: 0, presence: 0 };
      stream.reading = stream.counter.update(pose, stream.timestamp, 1280, 720);
      stream.timestamp += 100;
    }
    expect(stream.reading.count).toBe(1);
  });
  it("brief missing-hand frames do not erase a real completed movement", () => {
    const stream = new FrontStream();
    stream.hold(0); stream.hold(1, 5);
    stream.missing();
    expect(stream.hold(1, 3).count).toBe(0);
    expect(stream.hold(0, 8).count).toBe(1);
  });
  it("an isolated hand mislocation skips the frame without erasing the half-rep", () => {
    const stream = new FrontStream();
    stream.hold(0); stream.hold(1, 6);
    const bad = frontPose(1); bad[15].x += 0.3;
    expect(stream.counter.update(bad, stream.timestamp, 1280, 720)).toMatchObject({ count: 0, tracked: false });
    stream.timestamp += 100;
    expect(stream.hold(0, 8).count).toBe(1);
  });
  it("a pure camera pan does not manufacture a downward/upward movement", () => {
    const stream = new FrontStream();
    stream.hold(0);
    for (let i = 0; i < 30; i++) stream.frame(0, { dy: 50 * Math.sin(i / 4), dx: 25 * Math.sin(i / 3) });
    expect(stream.reading.count).toBe(0);
  });
});
