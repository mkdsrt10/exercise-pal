import type { RepMetrics } from "./schema";

/**
 * Short, supportive spoken lines. Kept deterministic so the phone can speak
 * them instantly without a network call; deeper review comes after the set.
 */

export function repLine(count: number): string {
  return String(count);
}

/** Live cue from the rep that just finished, or null. Throttled by the caller. */
export function liveCue(rep: RepMetrics, previous: RepMetrics[]): string | null {
  if (rep.durationSec > 0 && rep.durationSec < 1.0) return "Slow it down. Control the way back.";
  if (previous.length >= 2) {
    const best = Math.max(...previous.map((r) => r.maxDeg - r.minDeg));
    const now = rep.maxDeg - rep.minDeg;
    if (best > 0 && now < best * 0.7) return "Full range. Same depth as your first reps.";
  }
  return null;
}

export function setDoneLine(reps: number, weightKg: number | null, exerciseName: string | null): string {
  const what = exerciseName ? ` of ${exerciseName.toLowerCase()}` : "";
  const load = weightKg ? ` at ${trimZero(weightKg)} kilos` : "";
  return `Nice work. ${reps} reps${what}${load}. Logged.`;
}

const trimZero = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
