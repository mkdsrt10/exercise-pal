import { describe, expect, it } from "vitest";
import type { Features } from "../src/pose";
import { RepCounter } from "../src/reps";

const FPS = 30;

/** Deterministic noise so tests are stable. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647 - 0.5) * 2;
  };
}

function frame(over: Partial<Features>): Features {
  return { side: "left", hip: 170, knee: 175, elbow: 170, torso: 60, wrist: -60, visibility: 0.9, ...over };
}

/**
 * Builds a set: `restSec` still, then `reps` cycles of `periodSec`, then `restSec` still.
 * `shape(phase)` returns features for phase in [0,1): 0 = rest position, 0.5 = turn.
 */
function simulate(reps: number, periodSec: number, shape: (p: number) => Partial<Features>, restSec = 1.5, jitter = 3) {
  const rnd = noise(42);
  const frames: { t: number; f: Features }[] = [];
  let t = 0;
  const push = (over: Partial<Features>) => {
    const f = frame(over);
    for (const k of ["hip", "knee", "elbow", "torso", "wrist"] as const) f[k] += rnd() * jitter;
    frames.push({ t, f });
    t += 1000 / FPS;
  };
  for (let i = 0; i < restSec * FPS; i++) push(shape(0));
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < periodSec * FPS; i++) push(shape(i / (periodSec * FPS)));
  }
  for (let i = 0; i < restSec * FPS; i++) push(shape(0));
  return frames;
}

const wave = (p: number) => (1 - Math.cos(2 * Math.PI * p)) / 2; // 0 -> 1 -> 0

describe("RepCounter", () => {
  it("counts 10 bent-over rows on the elbow", () => {
    const frames = simulate(10, 3, (p) => ({ elbow: 170 - 100 * wave(p) }));
    const c = new RepCounter();
    for (const { t, f } of frames) c.update(t, f);
    expect(c.count).toBe(10);
    expect(c.signal).toBe("elbow");
    expect(c.reps[0]!.durationSec).toBeGreaterThan(2);
  });

  it("counts 11 kettlebell swings on the hip", () => {
    const frames = simulate(11, 2.5, (p) => ({
      hip: 175 - 85 * wave(p),
      torso: 10 + 55 * wave(p),
      knee: 170 - 20 * wave(p),
      wrist: -60 + 40 * wave(p),
    }));
    const c = new RepCounter();
    for (const { t, f } of frames) c.update(t, f);
    expect(c.count).toBe(11);
    expect(c.signal).toBe("hip");
  });

  it("counts fast reps", () => {
    const frames = simulate(15, 1.2, (p) => ({ elbow: 160 - 110 * wave(p) }));
    const c = new RepCounter();
    for (const { t, f } of frames) c.update(t, f);
    expect(c.count).toBe(15);
  });

  it("does not count when standing still", () => {
    const frames = simulate(0, 1, () => ({}), 10, 4);
    const c = new RepCounter();
    for (const { t, f } of frames) c.update(t, f);
    expect(c.count).toBe(0);
  });

  it("ignores frames without a visible body", () => {
    const c = new RepCounter();
    expect(c.update(0, null)).toEqual([]);
  });
});
