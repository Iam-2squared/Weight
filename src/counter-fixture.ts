import { PushupCounter, type CounterSnapshot, type Landmark } from "./counter";

export interface FrontFixtureOptions {
  width?: number;
  height?: number;
  mirrored?: boolean;
  rotation?: number;
  dx?: number;
  dy?: number;
  unilateral?: boolean;
  curl?: boolean;
}

/** Front-view planted hands with both shoulders descending and elbows flaring.
 * Only the six requested upper-body joints exist; no hips/legs are supplied. */
export function frontPose(depth: number, options: FrontFixtureOptions = {}): Landmark[] {
  const width = options.width ?? 1280, height = options.height ?? 720;
  const left = depth, right = options.unilateral ? 0 : depth;
  const body = options.curl ? 0 : 1;
  const pixels: Record<number, [number, number]> = {
    11: [450, 250 + 210 * left * body], 12: [830, 250 + 210 * right * body],
    13: [435 - 105 * left, 420 + 80 * left], 14: [845 + 105 * right, 420 + 80 * right],
    15: [420, 600 - (options.curl ? 220 * left : 0)], 16: [860, 600 - (options.curl ? 220 * right : 0)],
  };
  const scale = Math.min(width / 1280, height / 720);
  const ox = (width - 1280 * scale) / 2, oy = (height - 720 * scale) / 2;
  const angle = options.rotation ?? 0;
  const points: Landmark[] = Array.from({ length: 17 }, () => ({ x: 0, y: 0, visibility: 0, presence: 0 }));
  for (const [key, [x, y]] of Object.entries(pixels)) {
    const rx = 640 + (x - 640) * Math.cos(angle) - (y - 360) * Math.sin(angle) + (options.dx ?? 0);
    const ry = 360 + (x - 640) * Math.sin(angle) + (y - 360) * Math.cos(angle) + (options.dy ?? 0);
    const px = (rx * scale + ox) / width;
    points[Number(key)] = { x: options.mirrored ? 1 - px : px, y: (ry * scale + oy) / height, visibility: 0.98, presence: 0.99 };
  }
  return points;
}

export class FrontStream {
  readonly counter = new PushupCounter();
  reading: CounterSnapshot = this.counter.snapshot();
  timestamp = 0;
  constructor(readonly options: FrontFixtureOptions = {}, readonly step = 100) {}
  frame(depth: number, override: FrontFixtureOptions = {}) {
    const settings = { ...this.options, ...override };
    this.reading = this.counter.update(frontPose(depth, settings), this.timestamp,
      settings.width ?? 1280, settings.height ?? 720);
    this.timestamp += this.step;
    return this.reading;
  }
  hold(depth: number, frames = 6, override: FrontFixtureOptions = {}) {
    for (let i = 0; i < frames; i++) this.frame(depth, override);
    return this.reading;
  }
  cycle(override: FrontFixtureOptions = {}, depth = 1) {
    this.hold(0, 6, override);
    for (const value of [0.25, 0.5, 0.75]) this.frame(value * depth, override);
    this.hold(depth, 5, override);
    for (const value of [0.75, 0.5, 0.25]) this.frame(value * depth, override);
    return this.hold(0, 6, override);
  }
  missing(elapsed = 0) {
    this.timestamp += elapsed;
    this.reading = this.counter.update(null, this.timestamp, this.options.width ?? 1280, this.options.height ?? 720);
    this.timestamp += this.step;
    return this.reading;
  }
}
