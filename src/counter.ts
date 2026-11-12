export interface Landmark {
  x: number;
  y: number;
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

const JOINTS = {
  left: [11, 13, 15, 23, 27],
  right: [12, 14, 16, 24, 28],
} as const;

const MIN_VISIBILITY = 0.52;
const TOP_ANGLE = 155;
const DOWN_START_ANGLE = 136;
const BOTTOM_ANGLE = 95;
const TOP_FRAMES = 2;
const BOTTOM_FRAMES = 2;
const LOST_RESET_MS = 800;
const MIN_BOTTOM_MS = 250;
const COUNT_COOLDOWN_MS = 550;

export function jointAngle(
  first: Landmark,
  vertex: Landmark,
  last: Landmark,
  frameWidth: number,
  frameHeight: number,
): number {
  const ax = (first.x - vertex.x) * frameWidth;
  const ay = (first.y - vertex.y) * frameHeight;
  const bx = (last.x - vertex.x) * frameWidth;
  const by = (last.y - vertex.y) * frameHeight;
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (denominator < 1e-6) return Number.NaN;
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function visible(point: Landmark | undefined): point is Landmark {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  return (point.visibility ?? 1) >= MIN_VISIBILITY && (point.presence ?? 1) >= MIN_VISIBILITY;
}

function selectSide(points: readonly Landmark[]): { side: Side; joints: Landmark[] } | null {
  const candidates = (["left", "right"] as const).flatMap((side) => {
    const joints = JOINTS[side].map((index) => points[index]);
    if (!joints.every(visible)) return [];
    const score = joints.reduce((sum, point) => sum + (point.visibility ?? 1), 0);
    return [{ side, joints, score }];
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

/**
 * The rules deliberately require a visible lateral full-body pose.
 * This prevents counting arm waves made while standing, but does not
 * measure true chest-to-floor distance or certify exercise technique.
 */
export class PushupCounter {
  private reps = 0;
  private stage: Stage = "seeking";
  private activeSide: Side | null = null;
  private smoothedElbow: number | null = null;
  private topFrames = 0;
  private bottomFrames = 0;
  private bottomAt = 0;
  private lastCountAt = -Infinity;
  private lastTrackedAt = -Infinity;

  reset(): void {
    this.reps = 0;
    this.lastCountAt = -Infinity;
    this.resetTracking();
  }

  resetTracking(): void {
    this.stage = "seeking";
    this.activeSide = null;
    this.smoothedElbow = null;
    this.topFrames = 0;
    this.bottomFrames = 0;
    this.bottomAt = 0;
    this.lastTrackedAt = -Infinity;
  }

  snapshot(): CounterSnapshot {
    return {
      count: this.reps,
      stage: this.stage,
      side: this.activeSide,
      elbowAngle: this.smoothedElbow === null ? null : Math.round(this.smoothedElbow),
      bodyAngle: null,
      tracked: false,
      validForm: false,
      message: "全身が横から映るように設置してください",
    };
  }

  private markMissing(timestamp: number, message: string): CounterSnapshot {
    if (timestamp - this.lastTrackedAt > LOST_RESET_MS) this.resetTracking();
    return { ...this.snapshot(), message };
  }

  update(
    points: readonly Landmark[] | null | undefined,
    timestamp: number,
    frameWidth: number,
    frameHeight: number,
  ): CounterSnapshot {
    if (!points || frameWidth <= 0 || frameHeight <= 0) {
      return this.markMissing(timestamp, "全身が映る位置にカメラを調整してください");
    }
    const selection = selectSide(points);
    if (!selection) {
      return this.markMissing(timestamp, "肩・肘・手首・腰・足首を画面に入れてください");
    }
    const { side, joints } = selection;
    const [shoulder, elbow, wrist, hip, ankle] = joints;
    if (this.activeSide && this.activeSide !== side) this.resetTracking();
    this.activeSide = side;

    const rawElbow = jointAngle(shoulder, elbow, wrist, frameWidth, frameHeight);
    const bodyAngle = jointAngle(shoulder, hip, ankle, frameWidth, frameHeight);
    if (!Number.isFinite(rawElbow) || !Number.isFinite(bodyAngle)) {
      return this.markMissing(timestamp, "関節がうまく認識できません");
    }
    this.lastTrackedAt = timestamp;
    this.smoothedElbow =
      this.smoothedElbow === null ? rawElbow : this.smoothedElbow * 0.4 + rawElbow * 0.6;
    const angle = this.smoothedElbow;

    // A horizontal full-body plank is required; portrait/video cropping can invalidate it.
    const horizontalDistance = Math.abs((ankle.x - shoulder.x) * frameWidth);
    const verticalDistance = Math.abs((ankle.y - shoulder.y) * frameHeight);
    const isHorizontal = horizontalDistance >= verticalDistance * 1.25;
    const straightBody = bodyAngle >= 145;
    const validForm = isHorizontal && straightBody;

    if (!validForm) {
      // Invalid posture must never complete an earlier half-rep.
      this.stage = "seeking";
      this.topFrames = 0;
      this.bottomFrames = 0;
      return {
        ...this.snapshot(),
        elbowAngle: Math.round(angle),
        bodyAngle: Math.round(bodyAngle),
        tracked: true,
        validForm: false,
        message: !isHorizontal
          ? "カメラを横向きにし、体全体を水平に映してください"
          : "腰を上げ下げせず、体をまっすぐに保ってください",
      };
    }

    let message = "肘を伸ばし、スタート姿勢を取ってください";
    switch (this.stage) {
      case "seeking":
        this.topFrames = angle >= TOP_ANGLE ? this.topFrames + 1 : 0;
        if (this.topFrames >= TOP_FRAMES) this.stage = "ready";
        message = this.stage === "ready" ? "準備OK。ゆっくり下ろそう" : message;
        break;
      case "ready":
        if (angle < DOWN_START_ANGLE) {
          this.stage = "lowering";
          this.bottomFrames = 0;
        }
        message = this.stage === "lowering" ? "もう少し深く下ろそう" : "肘を曲げて下ろそう";
        break;
      case "lowering":
        this.bottomFrames = angle <= BOTTOM_ANGLE ? this.bottomFrames + 1 : 0;
        if (this.bottomFrames >= BOTTOM_FRAMES) {
          this.stage = "bottom";
          this.bottomAt = timestamp;
        } else if (angle >= TOP_ANGLE) {
          this.stage = "ready"; // Shallow dip is not a rep.
        }
        message = this.stage === "bottom" ? "そのまま腕を伸ばそう" : "胸をゆっくり下ろそう";
        break;
      case "bottom":
        this.topFrames = angle >= TOP_ANGLE ? this.topFrames + 1 : 0;
        if (
          this.topFrames >= TOP_FRAMES &&
          timestamp - this.bottomAt >= MIN_BOTTOM_MS &&
          timestamp - this.lastCountAt >= COUNT_COOLDOWN_MS
        ) {
          this.reps += 1;
          this.lastCountAt = timestamp;
          this.stage = "ready";
          this.topFrames = 0;
          message = "ナイス！ 次の1回へ";
        } else {
          message = "腕を最後まで伸ばして戻そう";
        }
        break;
    }

    return {
      count: this.reps,
      stage: this.stage,
      side,
      elbowAngle: Math.round(angle),
      bodyAngle: Math.round(bodyAngle),
      tracked: true,
      validForm: true,
      message,
    };
  }
}
