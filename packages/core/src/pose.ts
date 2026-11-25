/**
 * Geometry over the 33 MediaPipe pose landmarks (normalized image coordinates,
 * y pointing down). Pure functions so they run on the phone and in tests.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export interface Features {
  side: "left" | "right";
  /** Shoulder-hip-knee angle. ~180 standing tall, smaller when hinged. */
  hip: number;
  /** Hip-knee-ankle angle. ~180 straight legs. */
  knee: number;
  /** Shoulder-elbow-wrist angle. ~180 arm straight. */
  elbow: number;
  /** Hip-to-shoulder line measured from vertical. 0 upright, 90 horizontal. */
  torso: number;
  /** Wrist height above the hip in torso lengths, x100. */
  wrist: number;
  visibility: number;
}

const DEG = 180 / Math.PI;

/** Angle ABC in degrees. `aspect` = image width / height, so x and y share units. */
export function angleAt(a: Landmark, b: Landmark, c: Landmark, aspect = 1): number {
  const v1x = (a.x - b.x) * aspect;
  const v1y = a.y - b.y;
  const v2x = (c.x - b.x) * aspect;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot / n))) * DEG;
}

export function torsoFromVertical(shoulder: Landmark, hip: Landmark, aspect = 1): number {
  const dx = (shoulder.x - hip.x) * aspect;
  const dy = hip.y - shoulder.y; // positive when the shoulder is above the hip
  return Math.atan2(Math.abs(dx), dy) * DEG;
}

const vis = (l: Landmark | undefined) => (l ? l.visibility ?? 1 : 0);

/**
 * Picks the side of the body facing the camera and computes joint features.
 * Returns null when the key joints are not visible enough to trust.
 */
export function computeFeatures(lm: Landmark[], aspect = 1, minVisibility = 0.3): Features | null {
  const sides = (["left", "right"] as const).map((side) => {
    const L = side === "left";
    const p = {
      shoulder: lm[L ? LM.leftShoulder : LM.rightShoulder],
      elbow: lm[L ? LM.leftElbow : LM.rightElbow],
      wrist: lm[L ? LM.leftWrist : LM.rightWrist],
      hip: lm[L ? LM.leftHip : LM.rightHip],
      knee: lm[L ? LM.leftKnee : LM.rightKnee],
      ankle: lm[L ? LM.leftAnkle : LM.rightAnkle],
    };
    const v = Math.min(vis(p.shoulder), vis(p.hip), vis(p.elbow), vis(p.wrist));
    return { side, p, v };
  });
  const best = sides[0]!.v >= sides[1]!.v ? sides[0]! : sides[1]!;
  const { shoulder, elbow, wrist, hip, knee, ankle } = best.p;
  if (!shoulder || !elbow || !wrist || !hip || best.v < minVisibility) return null;

  const torsoLen = Math.hypot((shoulder.x - hip.x) * aspect, shoulder.y - hip.y) || 1;
  const kneeOk = knee && vis(knee) >= minVisibility;
  const ankleOk = ankle && vis(ankle) >= minVisibility;

  return {
    side: best.side,
    hip: kneeOk ? angleAt(shoulder, hip, knee!, aspect) : NaN,
    knee: kneeOk && ankleOk ? angleAt(hip, knee!, ankle!, aspect) : NaN,
    elbow: angleAt(shoulder, elbow, wrist, aspect),
    torso: torsoFromVertical(shoulder, hip, aspect),
    wrist: ((hip.y - wrist.y) / torsoLen) * 100,
    visibility: best.v,
  };
}
