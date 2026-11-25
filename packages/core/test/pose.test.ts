import { describe, expect, it } from "vitest";
import { angleAt, computeFeatures, LM, torsoFromVertical, type Landmark } from "../src/pose";

describe("geometry", () => {
  it("measures a right angle", () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
  });

  it("measures torso lean from vertical", () => {
    expect(torsoFromVertical({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.6 })).toBeCloseTo(0);
    expect(torsoFromVertical({ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.5 })).toBeCloseTo(90);
  });

  it("picks the visible side and computes features", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    lm[LM.leftShoulder] = { x: 0.5, y: 0.3, visibility: 0.9 };
    lm[LM.leftElbow] = { x: 0.5, y: 0.45, visibility: 0.9 };
    lm[LM.leftWrist] = { x: 0.5, y: 0.6, visibility: 0.9 };
    lm[LM.leftHip] = { x: 0.5, y: 0.6, visibility: 0.9 };
    lm[LM.leftKnee] = { x: 0.5, y: 0.8, visibility: 0.9 };
    lm[LM.leftAnkle] = { x: 0.5, y: 1.0, visibility: 0.9 };
    const f = computeFeatures(lm)!;
    expect(f.side).toBe("left");
    expect(f.hip).toBeCloseTo(180);
    expect(f.elbow).toBeCloseTo(180);
    expect(f.torso).toBeCloseTo(0);
  });

  it("returns null when the body is not visible", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.1 }));
    expect(computeFeatures(lm)).toBeNull();
  });
});
