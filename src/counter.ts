export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

export type Stage = "seeking" | "ready" | "lowering" | "bottom";
export type Side = "left" | "right";

export interface CounterSnapshot {
  count: number;
  stage: Stage;
  side: Side | null;
  elbowAngle: number | null;
  bodyAngle: number | null;
  tracked: boolean;
  validForm: boolean;
  message: string;
}

type Point = { x: number; y: number };
interface FrontPose {
  height: number;
  leftHeight: number;
  rightHeight: number;
  angle: number;
  extension: number;
  shoulderWidth: number;
  shoulder: Point;
  leftShoulder: Point;
  rightShoulder: Point;
  leftWrist: Point;
  rightWrist: Point;
  down: Point;
}

const MIN_VISIBILITY = 0.45;
const LOST_RESET_MS = 1500;
const STABLE_FRAMES = 2;
const MIN_DROP = 0.18;
const MIN_SHOULDER_DROP = 0.07;
const MIN_BOTTOM_MS = 180;
const COUNT_COOLDOWN_MS = 550;
const FRONT_JOINTS = [11, 12, 13, 14, 15, 16] as const;

export function jointAngle(first: Landmark, vertex: Landmark, last: Landmark,
  frameWidth: number, frameHeight: number): number {
  const ax = (first.x - vertex.x) * frameWidth;
  const ay = (first.y - vertex.y) * frameHeight;
  const bx = (last.x - vertex.x) * frameWidth;
  const by = (last.y - vertex.y) * frameHeight;
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (denominator < 1e-6) return Number.NaN;
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator))) * 180 / Math.PI;
}

export function isVisibleLandmark(point: Landmark | undefined): point is Landmark {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    (point.visibility ?? 1) >= MIN_VISIBILITY && (point.presence ?? 1) >= MIN_VISIBILITY;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const displacement = (from: Point, to: Point, down: Point) =>
  (to.x - from.x) * down.x + (to.y - from.y) * down.y;

/** All measurements use the upper body. Hips, knees, and feet may be cropped. */
function measureFront(points: readonly Landmark[], width: number, height: number): FrontPose | null {
  if (!FRONT_JOINTS.every(index => isVisibleLandmark(points[index]))) return null;
  const pixel = (index: number): Point => ({ x: points[index].x * width, y: points[index].y * height });
  const ls = pixel(11), rs = pixel(12), le = pixel(13), re = pixel(14);
  const lw = pixel(15), rw = pixel(16);
  const shoulderWidth = distance(ls, rs);
  if (shoulderWidth < Math.max(8, width * 0.025)) return null;
  const arms = [[ls, le, lw], [rs, re, rw]];
  const lengths = arms.map(([s, e, w]) => distance(s, e) + distance(e, w));
  if (lengths.some(length => length < shoulderWidth * 0.15)) return null;
  const a = lw.x < rw.x ? lw : rw, b = lw.x < rw.x ? rw : lw;
  const handSpan = distance(a, b);
  if (handSpan < shoulderWidth * 0.25) return null;
  const down = { x: -(b.y - a.y) / handSpan, y: (b.x - a.x) / handSpan };
  const heightAboveHands = (point: Point) => displacement(point, a, down) / shoulderWidth;
  const leftHeight = heightAboveHands(ls), rightHeight = heightAboveHands(rs);
  const angle = (jointAngle(points[11], points[13], points[15], width, height) +
    jointAngle(points[12], points[14], points[16], width, height)) / 2;
  if (!Number.isFinite(angle) || (leftHeight + rightHeight) / 2 < -0.25) return null;
  return {
    height: (leftHeight + rightHeight) / 2, leftHeight, rightHeight, angle,
    extension: (distance(ls, lw) / lengths[0] + distance(rs, rw) / lengths[1]) / 2,
    shoulderWidth, shoulder: midpoint(ls, rs), leftShoulder: ls, rightShoulder: rs,
    leftWrist: lw, rightWrist: rw, down,
  };
}

/** A front-view down/up movement is calibrated to the person's shoulder width
 * and initial hand position, rather than a side-view elbow angle or full-body
 * pose. It estimates repetitions; it does not certify exercise technique. */
export class PushupCounter {
  private reps = 0;
  private stage: Stage = "seeking";
  private smoothed: FrontPose | null = null;
  private top: FrontPose | null = null;
  private bottom: FrontPose | null = null;
  private topFrames = 0;
  private bottomFrames = 0;
  private risingFrames = 0;
  private bottomAt = 0;
  private lastTrackedAt = -Infinity;
  private lastCountAt = -Infinity;
  private referenceWidth: number | null = null;

  reset(): void {
    this.reps = 0;
    this.lastCountAt = -Infinity;
    this.resetTracking();
  }

  resetTracking(): void {
    this.stage = "seeking";
    this.smoothed = this.top = this.bottom = null;
    this.topFrames = this.bottomFrames = 0;
    this.risingFrames = 0;
    this.bottomAt = 0;
    this.lastTrackedAt = -Infinity;
    this.referenceWidth = null;
  }

  snapshot(): CounterSnapshot {
    return this.result(false, "正面から両肩・肘・手首を映してください");
  }

  private result(tracked: boolean, message: string): CounterSnapshot {
    return { count: this.reps, stage: this.stage, side: null,
      elbowAngle: this.smoothed ? Math.round(this.smoothed.angle) : null,
      bodyAngle: null, tracked, validForm: tracked, message };
  }

  private missing(timestamp: number, message = "正面から両肩・肘・手首を映してください"): CounterSnapshot {
    this.topFrames = this.bottomFrames = 0;
    this.risingFrames = 0;
    if (timestamp - this.lastTrackedAt > LOST_RESET_MS) this.resetTracking();
    return this.result(false, message);
  }

  private handsStayed(pose: FrontPose, reference: FrontPose): boolean {
    // A loose body-scaled allowance tolerates model jitter and perspective.
    // Large hand movement is not a push-up descent.
    return distance(pose.leftWrist, reference.leftWrist) <= reference.shoulderWidth * 0.4 &&
      distance(pose.rightWrist, reference.rightWrist) <= reference.shoulderWidth * 0.4;
  }

  private lowered(pose: FrontPose, top: FrontPose): boolean {
    const drop = top.height - pose.height;
    const bothShoulders = top.leftHeight - pose.leftHeight >= 0.08 &&
      top.rightHeight - pose.rightHeight >= 0.08 &&
      displacement(top.leftShoulder, pose.leftShoulder, top.down) >= top.shoulderWidth * 0.06 &&
      displacement(top.rightShoulder, pose.rightShoulder, top.down) >= top.shoulderWidth * 0.06;
    const realShoulderMotion = displacement(top.shoulder, pose.shoulder, top.down) >=
      top.shoulderWidth * MIN_SHOULDER_DROP;
    // Elbow bending corroborates a normal descent. A larger shoulder descent
    // remains usable when front-view projection hides the elbow-angle change.
    const bending = top.angle - pose.angle >= 8 || top.extension - pose.extension >= 0.035 || drop >= 0.28;
    return drop >= MIN_DROP && bothShoulders && realShoulderMotion && bending && this.handsStayed(pose, top);
  }

  update(points: readonly Landmark[] | null | undefined, timestamp: number,
    frameWidth: number, frameHeight: number): CounterSnapshot {
    if (!points || !Number.isFinite(timestamp) || !Number.isFinite(frameWidth) ||
      !Number.isFinite(frameHeight) || frameWidth <= 0 || frameHeight <= 0) return this.missing(timestamp);
    if (this.lastTrackedAt !== -Infinity && timestamp - this.lastTrackedAt > LOST_RESET_MS) this.resetTracking();
    const raw = measureFront(points, frameWidth, frameHeight);
    if (!raw) return this.missing(timestamp);
    if (this.stage === "seeking") {
      // The detector's first acquired hand position can be an outlier. Use
      // the latest calibration frame, not a permanent first-frame anchor.
      this.referenceWidth = raw.shoulderWidth;
      this.smoothed = this.top = raw;
      this.lastTrackedAt = timestamp;
      if (++this.topFrames >= STABLE_FRAMES) this.stage = "ready";
      return this.result(true, this.stage === "ready" ? "準備OK。胸をゆっくり下ろそう" : "腕を伸ばして構えてください");
    }
    // Hold one body scale for the session. Per-frame shoulder-span estimates
    // change with foreshortening and would otherwise manufacture moving peaks.
    this.referenceWidth ??= raw.shoulderWidth;
    const scale = raw.shoulderWidth / this.referenceWidth;
    raw.height *= scale;
    raw.leftHeight *= scale;
    raw.rightHeight *= scale;
    raw.shoulderWidth = this.referenceWidth;
    if (this.top && !this.handsStayed(raw, this.top)) {
      // A single occluded/mislocated hand must not erase a valid half-rep.
      // Do not use that frame; a sustained move still expires tracking.
      return this.missing(timestamp, "両手を床につけて構えてください");
    }
    this.lastTrackedAt = timestamp;
    const previous = this.smoothed;
    const blend = (current: number, before: number) => current * 0.6 + before * 0.4;
    const pose = this.smoothed = previous ? { ...raw,
      height: blend(raw.height, previous.height), leftHeight: blend(raw.leftHeight, previous.leftHeight),
      rightHeight: blend(raw.rightHeight, previous.rightHeight), angle: blend(raw.angle, previous.angle),
      extension: blend(raw.extension, previous.extension) } : raw;

    const top = this.top!;
    if (this.stage === "ready") {
      if (pose.height > top.height) this.top = pose;
      if (top.height - pose.height >= 0.07) this.stage = "lowering";
    }
    if (this.stage === "lowering") {
      this.bottomFrames = this.lowered(pose, top) ? this.bottomFrames + 1 : 0;
      if (this.bottomFrames >= STABLE_FRAMES) {
        this.stage = "bottom";
        this.bottom = pose;
        this.bottomAt = timestamp;
        this.topFrames = 0;
        this.risingFrames = 0;
      } else if (pose.height >= top.height - 0.04) {
        this.stage = "ready";
        this.top = pose;
        this.bottomFrames = 0;
      }
      return this.result(true, this.stage === "bottom" ? "そのまま腕を伸ばして戻そう" : "胸をゆっくり下ろそう");
    }
    if (this.stage === "bottom") {
      if (pose.height < this.bottom!.height) {
        this.bottom = pose;
        this.risingFrames = 0;
      } else if (previous && pose.height > previous.height + 0.015) {
        this.risingFrames++;
      } else if (previous && pose.height < previous.height - 0.04) {
        this.risingFrames = 0;
      }
      const bottom = this.bottom!;
      const travel = top.height - bottom.height;
      const returnTolerance = Math.max(0.12, travel * 0.30);
      const shoulderTravel = displacement(top.shoulder, bottom.shoulder, top.down);
      const recovered = pose.height >= top.height - returnTolerance &&
        pose.height >= bottom.height + (top.height - bottom.height) * 0.72 &&
        pose.leftHeight >= top.leftHeight - returnTolerance && pose.rightHeight >= top.rightHeight - returnTolerance &&
        displacement(bottom.shoulder, pose.shoulder, top.down) <= -top.shoulderWidth * 0.06 &&
        displacement(top.shoulder, pose.shoulder, top.down) <= Math.max(top.shoulderWidth * 0.12, shoulderTravel * 0.30);
      this.topFrames = recovered ? this.topFrames + 1 : 0;
      // A fast real rep can occupy just one upper frame. Two preceding rising
      // frames corroborate that return; a lone model spike still cannot count.
      const stableReturn = this.topFrames >= STABLE_FRAMES || (this.topFrames >= 1 && this.risingFrames >= 2);
      if (stableReturn && timestamp - this.bottomAt >= MIN_BOTTOM_MS &&
        timestamp - this.lastCountAt >= COUNT_COOLDOWN_MS) {
        this.reps++;
        this.lastCountAt = timestamp;
        this.stage = "ready";
        this.top = pose;
        this.bottom = null;
        this.topFrames = this.bottomFrames = 0;
        this.risingFrames = 0;
        return this.result(true, "ナイス！ 次の1回へ");
      }
      return this.result(true, "腕を伸ばして元の高さまで戻そう");
    }
    return this.result(true, "胸をゆっくり下ろそう");
  }
}
