import { describe, expect, it } from "vitest";
import { PushupCounter, type Landmark } from "./counter";
import evidence from "./test-fixtures/front-real-landmarks.json";

describe("recorded real frontal MediaPipe data", () => {
  for (const clip of evidence.clips) {
    it(`counts all ${clip.expectedCompletedReps} actual repetitions in ${clip.name}, with no hips/legs or appended end hold`, () => {
      const counter = new PushupCounter();
      for (const [timestamp, six] of clip.frames) {
        const points: Landmark[] | undefined = Array.isArray(six) ?
          Array.from({ length: 17 }, () => ({ x: 0, y: 0, visibility: 0, presence: 0 })) : undefined;
        if (points && Array.isArray(six)) {
          six.forEach((tuple, index) => {
            if (!Array.isArray(tuple)) throw new Error("Invalid recorded six-point fixture");
            const [x, y, visibility, presence] = tuple;
            points[evidence.landmarkIndices[index]] = { x, y, visibility, presence };
          });
        }
        const reading = counter.update(points, timestamp as number, clip.width, clip.height);
        expect(reading.count).toBeLessThanOrEqual(clip.expectedCompletedReps);
      }
      expect(counter.snapshot().count).toBe(clip.expectedCompletedReps);
    });
  }
});
