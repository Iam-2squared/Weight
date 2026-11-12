import {describe, expect, it} from "vitest";
import {HEIGHT_LANDMARKS, heightInMeters, heightLabel, journeyAt} from "./TowerJourney";

describe("push-up tower height mapping",()=>{
  it("converts each repetition to exactly half a meter",()=>{
    expect(heightInMeters(0)).toBe(0);
    expect(heightInMeters(1)).toBe(0.5);
    expect(heightInMeters(42)).toBe(21);
    expect(heightInMeters(1268)).toBe(634);
    expect(heightLabel(634)).toBe("634 m");
    expect(heightLabel(3776)).toBe("3.8 km");
  });
  it("uses realistic landmark thresholds and the correct scene transitions",()=>{
    expect(journeyAt(0).scene).toBe("gym");
    expect(journeyAt(8).scene).toBe("roof");
    expect(journeyAt(60).scene).toBe("city");
    expect(journeyAt(1268).scene).toBe("skytree");
    expect(journeyAt(7552).scene).toBe("fuji");
    expect(journeyAt(200000).scene).toBe("space");
    expect(journeyAt(768800000).scene).toBe("moon");
    expect(HEIGHT_LANDMARKS.at(-1)?.label).toBe("月");
  });
  it("shows the true remaining height, not the compressed visual drawing height",()=>{
    const j=journeyAt(100);
    expect(j.height).toBe(50);
    expect(j.next?.meters).toBe(333);
    expect(j.next?.meters-j.height).toBe(283);
    expect(j.progress).toBeGreaterThanOrEqual(0);
    expect(j.progress).toBeLessThanOrEqual(1);
  });
});
